
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using sims.Data;
using sims.Setup;

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

        app.UseExceptionHandler(errorApp =>
        {
            errorApp.Run(context => Results.Problem(
                statusCode: StatusCodes.Status500InternalServerError,
                title: "Die Anfrage konnte nicht verarbeitet werden").ExecuteAsync(context));
        });

        app.UseHttpsRedirection();

        app.UseAuthentication();
        app.UseAuthorization();


        app.MapControllers();

        app.Run();
    }
}
