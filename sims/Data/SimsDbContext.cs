using Microsoft.EntityFrameworkCore;
using sims.Models;

namespace sims.Data;

//VErerbung von der EF-Core-Basisklasse
//Datenbankkontextklasse
public class SimsDbContext : DbContext
{

    //base(options) übergibt die config an den Constructror der Basisklasse
    public SimsDbContext(DbContextOptions<SimsDbContext> options) : base(options)
    {
    }

    //übergibt den WErt an die DB Tabelle Spalte
    public DbSet<User> Users => Set<User>();

    public DbSet<Incident> Incidents => Set<Incident>();


    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .Property(user => user.Username)
            .HasMaxLength(100);

        modelBuilder.Entity<User>()
            .HasIndex(user => user.Username)
            .IsUnique();


        
        modelBuilder.Entity<Incident>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(incident => incident.ReporterId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Incident>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(incident => incident.AssigneeId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);
    }
}
