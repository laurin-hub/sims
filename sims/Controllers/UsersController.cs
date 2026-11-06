using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
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
