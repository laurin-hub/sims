using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using sims.Data;
using sims.DTOs;
using sims.Logging;
using sims.Models;

namespace sims.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly SimsDbContext _context;
    private readonly IRedisLogService _redisLogService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        SimsDbContext context,
        IRedisLogService redisLogService,
        ILogger<AuthController> logger)
    {
        _context = context;
        _redisLogService = redisLogService;
        _logger = logger;
    }

    [AllowAnonymous]
    [HttpGet("csrf-token")]
    public IActionResult GetCsrfToken([FromServices] IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        Response.Headers.CacheControl = "no-store";

        return Ok(new { requestToken = tokens.RequestToken });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [Consumes("application/json")]
    public async Task<IActionResult> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        const string invalidCredentials = "Anmeldung fehlgeschlagen.";

        if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length > 100
            || string.IsNullOrEmpty(request.Password))
        {
            return Unauthorized(new { message = invalidCredentials });
        }

        try
        {
            var user = await _context.Users.AsNoTracking()
                .SingleOrDefaultAsync(user => user.Username == request.Username, cancellationToken);

            if (user is null || !user.IsActive || string.IsNullOrEmpty(user.PasswordHash)
                || !Enum.IsDefined(user.Role))
            {
                return Unauthorized(new { message = invalidCredentials });
            }

            var passwordHasher = new PasswordHasher<User>();
            PasswordVerificationResult verificationResult;
            try
            {
                verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            }
            catch (FormatException)
            {
                return Unauthorized(new { message = invalidCredentials });
            }

            if (verificationResult == PasswordVerificationResult.Failed)
            {
                return Unauthorized(new { message = invalidCredentials });
            }

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role.ToString())
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity),
                new AuthenticationProperties
                {
                    IsPersistent = false,
                    AllowRefresh = false,
                    ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(30)
                });

            var stored = await _redisLogService.WriteAsync(LogLevel.Information,
                $"User {user.Id} logged in successfully");
            if (!stored)
            {
                _logger.LogWarning(
                    "Anmeldung erfolgreich, Redis-Protokollierung jedoch nicht bestätigt. Die HTTP-Erfolgsbestätigung bleibt erhalten");
            }

            return Ok(new { message = "Anmeldung erfolgreich." });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Die Anmeldung konnte nicht verarbeitet werden.");
        }
    }
}
