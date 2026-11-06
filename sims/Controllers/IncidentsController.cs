using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using sims.Data;
using sims.DTOs;
using sims.Models;

namespace sims.Controllers;

[ApiController]
[Authorize]
[Route("api/incidents")]
public class IncidentsController : ControllerBase
{
    private readonly SimsDbContext _context;

    public IncidentsController(SimsDbContext context)
    {
        _context = context;
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
                title: "Die Vorfälle konnten nicht geladen werden.");
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
                title: "Der Vorfall konnte nicht geladen werden.");
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
                return BadRequest(new { message = "Ein vorhandener, aktiver Bearbeiter ist erforderlich." });
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
                title: "Der Vorfall konnte nicht angelegt werden.");
        }
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
