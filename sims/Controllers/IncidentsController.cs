using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using sims.Data;
using sims.DTOs;
using sims.Logging;
using sims.Models;

namespace sims.Controllers;

[ApiController]
[Authorize]
[Route("api/incidents")]
public class IncidentsController : ControllerBase
{
    private readonly SimsDbContext _context;
    private readonly IRedisLogService _redisLogService;
    private readonly ILogger<IncidentsController> _logger;

    public IncidentsController(
        SimsDbContext context,
        IRedisLogService redisLogService,
        ILogger<IncidentsController> logger)
    {
        _context = context;
        _redisLogService = redisLogService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<List<IncidentResponseDto>>> Get(CancellationToken cancellationToken)
    {
        try
        {
            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var incidents = await GetVisibleIncidents(user)
                .OrderBy(incident => incident.Id)
                .ToListAsync(cancellationToken);

            return Ok(incidents);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Die INcidents konnten nicht geladen werden.");
        }
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<IncidentResponseDto>> GetById(int id, CancellationToken cancellationToken)
    {
        try
        {
            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var incident = await GetVisibleIncidents(user)
                .SingleOrDefaultAsync(incident => incident.Id == id, cancellationToken);

            if (incident is null)
            {
                return NotFound();
            }

            return Ok(incident);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Incident konnte nicht geladen werden.");
        }
    }

    [HttpPost]
    public async Task<ActionResult<IncidentResponseDto>> Create(
        CreateIncidentRequestDto request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.System) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest(new { message = "Betroffenes System und Beschreibung sind erforderlich." });
        }

        if (request.AssigneeId <= 0 || !Enum.IsDefined(request.Severity))
        {
            return BadRequest(new { message = "Bearbeiter-ID oder Schweregrad ist ungültig." });
        }

        try
        {
            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var assigneeExists = await _context.Users.AnyAsync(
                assignee => assignee.Id == request.AssigneeId && assignee.IsActive, cancellationToken);
            if (!assigneeExists)
            {
                return BadRequest(new { message = "Ein vorhandener aktiver Bearbeiter ist erforderlich." });
            }

            var incident = new Incident
            {
                ReporterId = user.Id,
                AssigneeId = request.AssigneeId,
                Severity = request.Severity,
                Status = IncidentStatus.New,
                Cve = string.IsNullOrWhiteSpace(request.Cve) ? null : request.Cve.Trim(),
                System = request.System.Trim(),
                Description = request.Description.Trim(),
                CreatedAt = DateTimeOffset.UtcNow
            };

            _context.Incidents.Add(incident);
            await _context.SaveChangesAsync(cancellationToken);

            await LogIncidentAsync(LogLevel.Information,
                $"Incident {incident.Id} created by user {incident.ReporterId}, assigned to user {incident.AssigneeId}.");

            var response = new IncidentResponseDto
            {
                Id = incident.Id,
                ReporterId = incident.ReporterId,
                AssigneeId = incident.AssigneeId,
                Severity = incident.Severity,
                Status = incident.Status,
                Cve = incident.Cve,
                System = incident.System,
                Description = incident.Description,
                CreatedAt = incident.CreatedAt
            };

            return CreatedAtAction(nameof(GetById), new { id = incident.Id }, response);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Incident konnte nicht angelegt werden.");
        }
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<IncidentResponseDto>> Update(
        int id, UpdateIncidentRequestDto request, CancellationToken cancellationToken)
    {
        if (id <= 0 || string.IsNullOrWhiteSpace(request.System)
            || string.IsNullOrWhiteSpace(request.Description)
            || !Enum.IsDefined(request.Severity)
            || (request.Status.HasValue && !Enum.IsDefined(request.Status.Value)))
        {
            return BadRequest(new { message = "ID, Pflichtfeldr, Severity oder Status sind ungültig" });
        }

        try
        {
            // Lesesperren bleiben bis zum Speichern bestehen, auch für Berechtigungen und Status.
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.RepeatableRead, cancellationToken);

            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var incident = await _context.Incidents.SingleOrDefaultAsync(
                incident => incident.Id == id, cancellationToken);
            if (incident is null)
            {
                return NotFound();
            }

            if (!CanEditIncident(user, incident))
            {
                return Forbid();
            }

            if (incident.Status == IncidentStatus.Closed)
            {
                return Conflict(new { message = "Geschlossene Incidents dürfen nicht bearbeitet werden" });
            }

            if (request.Status.HasValue
                && (request.Status.Value == IncidentStatus.Closed
                    || (request.Status.Value != incident.Status
                        && !(incident.Status == IncidentStatus.New && request.Status.Value == IncidentStatus.Active))))
            {
                return Conflict(new { message = "Dieser Statuswechsel ist nicht erlaubt. Zum Schließen den Close-Endpunkt verwenden." });
            }

            incident.Severity = request.Severity;
            incident.System = request.System.Trim();
            incident.Description = request.Description.Trim();
            incident.Cve = string.IsNullOrWhiteSpace(request.Cve) ? null : request.Cve.Trim();
            if (request.Status.HasValue)
            {
                incident.Status = request.Status.Value;
            }

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            await LogIncidentAsync(LogLevel.Information,
                $"Incident {incident.Id} updated by user {user.Id}.");

            return Ok(ToResponseDto(incident));
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Incidet konnte nicht bearbeitet werden.");
        }
    }

    [HttpPost("{id:int}/close")]
    public async Task<ActionResult<IncidentResponseDto>> Close(int id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { message = "Die Incident-ID muss größer als 0 sein." });
        }

        try
        {
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.RepeatableRead, cancellationToken);

            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var incident = await _context.Incidents.SingleOrDefaultAsync(
                incident => incident.Id == id, cancellationToken);
            if (incident is null)
            {
                return NotFound();
            }

            if (!CanEditIncident(user, incident))
            {
                return Forbid();
            }

            if (incident.Status == IncidentStatus.Closed)
            {
                return Conflict(new { message = "Der Incident ist bereits geschlossen." });
            }

            incident.Status = IncidentStatus.Closed;
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            await LogIncidentAsync(LogLevel.Information,
                $"Incident {incident.Id} closed by user {user.Id}.");

            return Ok(ToResponseDto(incident));
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Der INcident konnte nicht geschlossen werden.");
        }
    }

    //Incident eskalieren
    [HttpPost("{id:int}/escalate")]
    public async Task<ActionResult<IncidentResponseDto>> Escalate(
        int id, EscalateIncidentRequestDto request, CancellationToken cancellationToken)
    {
        if (id <= 0 || request.NewAssigneeId <= 0)
        {
            return BadRequest(new { message = "Incident-ID und Bearbeiter-ID müssen größer als 0 sein." });
        }

        try
        {
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.RepeatableRead, cancellationToken);

            var user = await GetCurrentUserAsync(cancellationToken);
            if (user is null || !user.IsActive || !Enum.IsDefined(user.Role))
            {
                return Forbid();
            }

            var incident = await _context.Incidents.SingleOrDefaultAsync(
                incident => incident.Id == id, cancellationToken);
            if (incident is null)
            {
                return NotFound();
            }

            if (!CanEditIncident(user, incident))
            {
                return Forbid();
            }

            if (incident.Status == IncidentStatus.Closed)
            {
                return Conflict(new { message = "Geschlossene Incidents dürfen nicht eskaliert werden." });
            }

            var assigneeExists = await _context.Users.AnyAsync(
                assignee => assignee.Id == request.NewAssigneeId && assignee.IsActive, cancellationToken);
            if (!assigneeExists)
            {
                return BadRequest(new { message = "Ein vorhandener aktiver Bearbeiter ist erforderlich." });
            }

            if (incident.AssigneeId == request.NewAssigneeId)
            {
                return Conflict(new { message = "Der neue BEarbeiter entspricht dem bisherigen Bearbeiter." });
            }

            var previousAssigneeId = incident.AssigneeId;
            incident.AssigneeId = request.NewAssigneeId;
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            await LogIncidentAsync(LogLevel.Warning,
                $"Incident {incident.Id} escaláted by user {user.Id} from assignee {previousAssigneeId} to asignee {incident.AssigneeId}.");

            return Ok(ToResponseDto(incident));
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Incident konnte nicht eskaliert werden");
        }
    }

    private async Task LogIncidentAsync(LogLevel logLevel, string message)
    {
        var stored = await _redisLogService.WriteAsync(logLevel, message);
        if (!stored)
        {
            // Der Service behandelt Redis-Fehler; die SQL-Änderung ist bereits bestätigt.
            _logger.LogWarning(
                "Incident-Aktion in SQL Server gespeichert, Redis-Protokollierung jedoch nicht bestätigt. Die HTTP-Erfolgsbestätigung bleibt erhalten.");
        }
    }

    private static bool CanEditIncident(User user, Incident incident)
    {
        return user.Role == UserRole.Administrator || incident.AssigneeId == user.Id;
    }

    private static IncidentResponseDto ToResponseDto(Incident incident)
    {
        return new IncidentResponseDto
        {
            Id = incident.Id,
            ReporterId = incident.ReporterId,
            AssigneeId = incident.AssigneeId,
            Severity = incident.Severity,
            Status = incident.Status,
            Cve = incident.Cve,
            System = incident.System,
            Description = incident.Description,
            CreatedAt = incident.CreatedAt
        };
    }

    private async Task<User?> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) || userId <= 0)
        {
            return null;
        }

        return await _context.Users.AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new User
            {
                Id = user.Id,
                Role = user.Role,
                IsActive = user.IsActive
            })
            .SingleOrDefaultAsync(cancellationToken);
    }

    private IQueryable<IncidentResponseDto> GetVisibleIncidents(User user)
    {
        var isAdministrator = user.Role == UserRole.Administrator
            && User.IsInRole(nameof(UserRole.Administrator));

        return _context.Incidents.AsNoTracking()
            .Where(incident => isAdministrator || incident.ReporterId == user.Id || incident.AssigneeId == user.Id)
            .Select(incident => new IncidentResponseDto
            {
                Id = incident.Id,
                ReporterId = incident.ReporterId,
                AssigneeId = incident.AssigneeId,
                Severity = incident.Severity,
                Status = incident.Status,
                Cve = incident.Cve,
                System = incident.System,
                Description = incident.Description,
                CreatedAt = incident.CreatedAt
            });
    }
}
