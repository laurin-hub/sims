
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using sims.Data;
using sims.Setup;
using sims.Logging;
using StackExchange.Redis;

namespace sims;

public class Program
{
    //
    public static async Task Main(string[] args)
    {
        var bootstrapAdmin = args.Contains("--bootstrap-admin", StringComparer.Ordinal);
        var builder = WebApplication.CreateBuilder(bootstrapAdmin
            ? args.Where(argument => argument != "--bootstrap-admin").ToArray()
            : args);

        // Add services to the container.

        var connectionString = builder.Configuration.GetConnectionString("SIMS");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Der Connection String 'SIMS' fehlt oder ist leer. Bitte 'ConnectionStrings:SIMS' konfigurieren.");
        }

        builder.Services.AddDbContext<SimsDbContext>(options =>
            options.UseSqlServer(connectionString));

        builder.Services.AddSingleton<Func<Task<IConnectionMultiplexer>>>(_ => async () =>
        {
            var redisConnectionString = builder.Configuration.GetConnectionString("Redis");
            if (string.IsNullOrWhiteSpace(redisConnectionString))
            {
                throw new InvalidOperationException("ConnectionStrings:Redis fehlt oder ist leer.");
            }

            var options = ConfigurationOptions.Parse(redisConnectionString);
            options.AbortOnConnectFail = false;
            options.ConnectTimeout = 2000;
            options.ConnectRetry = 1;
            options.AsyncTimeout = 2000;
            options.SyncTimeout = 2000;
            options.BacklogPolicy = BacklogPolicy.FailFast;
            options.IncludeDetailInExceptions = false;

            return await ConnectionMultiplexer.ConnectAsync(options);
        });
        builder.Services.AddSingleton<IRedisLogService, RedisLogService>();

        builder.Services.AddControllersWithViews(options =>
        {
            options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute());
        });

        builder.Services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "SIMS.CSRF";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
                ? CookieSecurePolicy.SameAsRequest
                : CookieSecurePolicy.Always;
        });

        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "SIMS.Auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
                options.SlidingExpiration = false;
                options.Events.OnValidatePrincipal = async context =>
                {
                    var principal = context.Principal;
                    var userIdClaim = principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                    var roleClaims = principal?.FindAll(ClaimTypes.Role).ToArray();
                    var isValid = false;

                    if (int.TryParse(userIdClaim, out var userId) && userId > 0
                        && roleClaims is { Length: 1 })
                    {
                        var dbContext = context.HttpContext.RequestServices
                            .GetRequiredService<SimsDbContext>();
                        var user = await dbContext.Users.AsNoTracking()
                            .Where(user => user.Id == userId)
                            .Select(user => new { user.IsActive, user.Role })
                            .SingleOrDefaultAsync(context.HttpContext.RequestAborted);

                        isValid = user is not null && user.IsActive && Enum.IsDefined(user.Role)
                            && roleClaims[0].Value == user.Role.ToString();
                    }

                    if (!isValid)
                    {
                        context.RejectPrincipal();
                        await context.HttpContext.SignOutAsync(context.Scheme.Name);
                    }
                };
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });
        builder.Services.AddAuthorization();
        
        //brauchen wir das?
        builder.Services.AddOpenApi();

        var app = builder.Build();

        if (bootstrapAdmin)
        {
            try
            {
                Environment.ExitCode = await InitialAdminBootstrap.RunAsync(app.Services, app.Environment);
            }
            finally
            {
                await app.DisposeAsync();
            }

            return;
        }

        //HTTP request pipeline konfigurien
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        // Äußerhalb vom Exception Handler auch dessen fertige 500-Antwort erfassen.
        app.Use(async (context, next) =>
        {
            await next(context);

            if (context.RequestAborted.IsCancellationRequested
                || !context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
                || context.Response.StatusCode != StatusCodes.Status500InternalServerError)
            {
                return;
            }

            var method = context.Request.Method switch
            {
                "GET" => "GET",
                "HEAD" => "HEAD",
                "POST" => "POST",
                "PUT" => "PUT",
                "PATCH" => "PATCH",
                "DELETE" => "DELETE",
                "OPTIONS" => "OPTIONS",
                "TRACE" => "TRACE",
                "CONNECT" => "CONNECT",
                _ => "OTHER"
            };
            var message = $"API technical error: HTTP 500, method {method}";
            if (context.User.Identity?.IsAuthenticated == true
                && int.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                && userId > 0)
            {
                message += $", user {userId}";
            }

            var stored = false;
            try
            {
                var redisLogService = context.RequestServices.GetRequiredService<IRedisLogService>();
                stored = await redisLogService.WriteAsync(LogLevel.Error, message + ".");
            }
            catch (Exception)
            {
                //Logging-Fehler ohne sensible Details behandeln, HTTP-Antwort nicht verändern
            }

            if (!stored)
            {
                app.Logger.LogError(
                    "Technisches API-Fehlerereignis nicht in Redis bestätigt. Die HTTP-500-Antwort bleibt unverändert.");
            }
        });

        app.UseExceptionHandler(errorApp =>
        {
            errorApp.Run(context => Results.Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Die Anfrage konnte nicht verarbeitet werden").ExecuteAsync(context));
        });

        app.UseHttpsRedirection();

        //
        app.Use(async (context, next) =>
        {
            await next(context);

            var statusCode = context.Response.StatusCode;
            if (!context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
                || (statusCode != StatusCodes.Status401Unauthorized
                    && statusCode != StatusCodes.Status403Forbidden)
                || context.Items.ContainsKey(sims.Controllers.AuthController.FailedLoginLogAttemptedKey))
            {
                return;
            }

            var method = context.Request.Method switch
            {
                "GET" => "GET",
                "HEAD" => "HEAD",
                "POST" => "POST",
                "PUT" => "PUT",
                "PATCH" => "PATCH",
                "DELETE" => "DELETE",
                "OPTIONS" => "OPTIONS",
                "TRACE" => "TRACE",
                "CONNECT" => "CONNECT",
                _ => "OTHER"
            };
            var message = $"API access denied: HTTP {statusCode}, method {method}";
            if (context.User.Identity?.IsAuthenticated == true
                && int.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
                && userId > 0)
            {
                message += $", user {userId}";
            }

            var stored = false;
            try
            {
                var redisLogService = context.RequestServices.GetRequiredService<IRedisLogService>();
                stored = await redisLogService.WriteAsync(LogLevel.Warning, message + ".");
            }
            catch (Exception)
            {
                // es werden keine Exceptiondetails gespeichert und die 401/403-Antwort bleibt erhalten.
            }

            if (!stored)
            {
                app.Logger.LogWarning(
                    "Security-Ereignis nicht in Redis bestätigt. Die HTTP-Antwort bleibt unverändert.");
            }
        });

        app.UseAuthentication();
        app.UseAuthorization();


        app.MapControllers();

        app.Run();
    }
}
