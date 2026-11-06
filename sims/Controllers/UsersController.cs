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
                title: "Die Benutzer konnten nicht geladen werden.");
        }
    }
}
