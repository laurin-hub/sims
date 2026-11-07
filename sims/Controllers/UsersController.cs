using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using sims.Data;
using sims.DTOs;
using sims.Models;

namespace sims.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly SimsDbContext _context;

    public UsersController(SimsDbContext context)
    {
        _context = context;
    }

    [HttpPost]
    [Authorize(Roles = nameof(UserRole.Administrator))]
    public async Task<ActionResult<UserResponseDto>> Create(
        CreateUserRequestDto request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username)
            || request.Username.Length < 3 || request.Username.Length > 100
            || request.Username != request.Username.Trim()
            || request.Username.Any(char.IsControl))
        {
            return BadRequest(new { message = "Der Benutzername muss 3 bis 100 Zeichen enthalten, ohne äußere Leerzeichen oder Steuerzeichen." });
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)
        {
            return BadRequest(new { message = "Das Passwort muss mindestens 12 Zeichen enthalten und darf nicht nur aus Leerzeichen bestehen." });
        }

        if (!Enum.IsDefined(request.Role) || !Enum.IsDefined(request.SupportLevel))
        {
            return BadRequest(new { message = "Rolle oder Support-Level ist ungültig." });
        }

        const string usernameConflict = "Der Benutzername ist bereits vergeben.";

        try
        {
            if (await _context.Users.AnyAsync(user => user.Username == request.Username, cancellationToken))
            {
                return Conflict(new { message = usernameConflict });
            }

            var user = new User
            {
                Username = request.Username,
                Role = request.Role,
                SupportLevel = request.SupportLevel,
                IsActive = true
            };

            var passwordHasher = new PasswordHasher<User>();
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

            _context.Users.Add(user);
            await _context.SaveChangesAsync(cancellationToken);

            var response = new UserResponseDto
            {
                Id = user.Id,
                Username = user.Username,
                Role = user.Role,
                SupportLevel = user.SupportLevel,
                IsActive = user.IsActive
            };

            return StatusCode(StatusCodes.Status201Created, response);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            // Der Unique Index schützt auch bei gleichzeitig eintreffenden Anfragen.
            return Conflict(new { message = usernameConflict });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Benutzer konnte nicht angelegt werden.");
        }
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = nameof(UserRole.Administrator))]
    public async Task<ActionResult<UserResponseDto>> Update(
        int id, UpdateUserRequestDto request, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { message = "Die Benutzr-ID muss größer als 0 sein." });
        }

        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var administratorId)
            || administratorId <= 0)
        {
            return Forbid();
        }

        const string usernameConflict = "Der Benutzername ist bereits vergeben.";

        try
        {
            // Berechtigung Check, mind. ein aktiver Admin muss übrig bleiben - Änderung werden gemeinsam abgesichert
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable, cancellationToken);

            var isActiveAdministrator = await _context.Users.AnyAsync(
                user => user.Id == administratorId && user.IsActive
                    && user.Role == UserRole.Administrator, cancellationToken);
            if (!isActiveAdministrator)
            {
                return Forbid();
            }

            var user = await _context.Users.SingleOrDefaultAsync(
                user => user.Id == id, cancellationToken);
            if (user is null)
            {
                return NotFound();
            }

            if (string.IsNullOrWhiteSpace(request.Username)
                || request.Username.Length < 3 || request.Username.Length > 100
                || request.Username != request.Username.Trim()
                || request.Username.Any(char.IsControl))
            {
                return BadRequest(new { message = "Der Benutzername muss 3 bis 100 Zeichen enthalten, ohne äußere Leerzeichen oder Steuerzeichen." });
            }

            if (!Enum.IsDefined(request.Role) || !Enum.IsDefined(request.SupportLevel))
            {
                return BadRequest(new { message = "Rolle oder Support-Level ist ungültig." });
            }

            if (await _context.Users.AnyAsync(
                other => other.Id != id && other.Username == request.Username, cancellationToken))
            {
                return Conflict(new { message = usernameConflict });
            }

            if (user.Id == administratorId && request.Role != UserRole.Administrator)
            {
                return Conflict(new { message = "Die eigene Administratorrolle darf nicht entzogen werden." });
            }

            if (user.IsActive && user.Role == UserRole.Administrator
                && request.Role != UserRole.Administrator)
            {
                var anotherAdministratorExists = await _context.Users.AnyAsync(
                    other => other.Id != id && other.IsActive
                        && other.Role == UserRole.Administrator, cancellationToken);
                if (!anotherAdministratorExists)
                {
                    return Conflict(new { message = "Der letze aktive Administrator darf nicht herabgestuft werden." });
                }
            }

            user.Username = request.Username;
            user.Role = request.Role;
            user.SupportLevel = request.SupportLevel;

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new UserResponseDto
            {
                Id = user.Id,
                Username = user.Username,
                Role = user.Role,
                SupportLevel = user.SupportLevel,
                IsActive = user.IsActive
            });
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return Conflict(new { message = usernameConflict });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Benutzer konnte nicht bearbeitet werden.");
        }
    }

    [HttpPatch("{id:int}/disable")]
    [Authorize(Roles = nameof(UserRole.Administrator))]
    public async Task<ActionResult<UserResponseDto>> Disable(int id, CancellationToken cancellationToken)
    {
        if (id <= 0)
        {
            return BadRequest(new { message = "Die Benutze-ID muss größer als 0 sein." });
        }

        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var administratorId)
            || administratorId <= 0)
        {
            return Forbid();
        }

        try
        {
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable, cancellationToken);

            var isActiveAdministrator = await _context.Users.AnyAsync(
                user => user.Id == administratorId && user.IsActive
                    && user.Role == UserRole.Administrator, cancellationToken);
            if (!isActiveAdministrator)
            {
                return Forbid();
            }

            var user = await _context.Users.SingleOrDefaultAsync(
                user => user.Id == id, cancellationToken);
            if (user is null)
            {
                return NotFound();
            }

            if (!user.IsActive)
            {
                return Conflict(new { message = "Der Benutzer ist bereits deaktiviert." });
            }

            if (user.Id == administratorId)
            {
                return Conflict(new { message = "Das eigene Administratokonto darf nicht deaktiviert werden." });
            }

            if (user.Role == UserRole.Administrator)
            {
                var anotherAdministratorExists = await _context.Users.AnyAsync(
                    other => other.Id != id && other.IsActive
                        && other.Role == UserRole.Administrator, cancellationToken);
                if (!anotherAdministratorExists)
                {
                    return Conflict(new { message = "Der letzte aktive Administrator darf nicht deaktiviert werden." });
                }
            }

            user.IsActive = false;
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new UserResponseDto
            {
                Id = user.Id,
                Username = user.Username,
                Role = user.Role,
                SupportLevel = user.SupportLevel,
                IsActive = user.IsActive
            });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Der Benutzer konnte nicht deaktiviert werden.");
        }
    }

    [HttpGet]
    [Authorize(Roles = nameof(UserRole.Administrator))]
    public async Task<ActionResult<List<UserResponseDto>>> Get(CancellationToken cancellationToken)
    {
        try
        {
            var users = await _context.Users
                .AsNoTracking()
                .Select(user => new UserResponseDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Role = user.Role,
                    SupportLevel = user.SupportLevel,
                    IsActive = user.IsActive
                })
                .ToListAsync(cancellationToken);

            return Ok(users);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Die BEnutzer konnten nicht geladen werden.");
        }
    }
}
