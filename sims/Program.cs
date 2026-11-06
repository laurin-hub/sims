
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.Cookies;
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

        builder.Services.AddControllers();

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

        app.UseHttpsRedirection();

        app.UseAuthentication();
        app.UseAuthorization();


        app.MapControllers();

        app.Run();
    }
}
