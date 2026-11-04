
using Microsoft.EntityFrameworkCore;
using sims.Data;

namespace sims;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

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
