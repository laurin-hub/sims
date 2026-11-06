using System.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using sims.Data;
using sims.Models;

namespace sims.Setup;

public static class InitialAdminBootstrap
{
    public static async Task<int> RunAsync(IServiceProvider services, IHostEnvironment environment)
    {
        if (!environment.IsDevelopment())
        {
            Console.Error.WriteLine("Der Administrator-Bootstrap ist nur in Development erlaubt.");
            return 1;
        }

        var username = Environment.GetEnvironmentVariable("SIMS_BOOTSTRAP_ADMIN_USERNAME");
        var password = Environment.GetEnvironmentVariable("SIMS_BOOTSTRAP_ADMIN_PASSWORD");

        if (string.IsNullOrWhiteSpace(username) || username.Length < 3 || username.Length > 100
            || username != username.Trim() || username.Any(char.IsControl))
        {
            Console.Error.WriteLine(
                "SIMS_BOOTSTRAP_ADMIN_USERNAME muss 3 bis 100 Zeichen enthalten, ohne äußere Leerzeichen oder Steurzeichen.");
            return 1;
        }

        if (string.IsNullOrWhiteSpace(password) || password.Length < 12)
        {
            Console.Error.WriteLine(
                "SIMS_BOOTSTRAP_ADMIN_PASSWORD muss mindestens 12 Zeichen enthaltn und darf nicht nur aus Leerzeichen bestehen.");
            return 1;
        }

        try
        {
            await using var scope = services.CreateAsyncScope();
            var context = scope.ServiceProvider.GetRequiredService<SimsDbContext>();

            // Prüfung und Anlage bilden eine Einheit, auch bei parallelen Bootstrap-Aufrufen.
            await using var transaction = await context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

            if (await context.Users.AnyAsync(user => user.Role == UserRole.Administrator))
            {
                Console.Error.WriteLine("Es existiert bereits ein Administrator. Es wurde kein Benutzer angelegt.");
                return 1;
            }

            if (await context.Users.AnyAsync(user => user.Username == username))
            {
                Console.Error.WriteLine("Der gewünschte Benutzername ist bereits vergeben. Bestehende Benutzer bleiben unverändert.");
                return 1;
            }

            var administrator = new User
            {
                Username = username,
                Role = UserRole.Administrator,
                SupportLevel = SupportLevel.L1,
                IsActive = true
            };

            var passwordHasher = new PasswordHasher<User>();
            administrator.PasswordHash = passwordHasher.HashPassword(administrator, password);

            context.Users.Add(administrator);
            await context.SaveChangesAsync();
            await transaction.CommitAsync();

            Console.WriteLine("Der erste Administrator wurde erfolgreich angelegt.");
            return 0;
        }
        catch (Exception)
        {
            Console.Error.WriteLine(
                "Die Administratoranlage konnte nicht abgeschlossen werden. Datenbankkonfiguration und Verfügbarkeit prüfen; bei parallelen Aufrufen erneut versuchen.");
            return 1;
        }
    }
}
