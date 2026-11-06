
using Microsoft.EntityFrameworkCore;
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

        app.UseAuthorization();


        app.MapControllers();

        app.Run();
    }
}
