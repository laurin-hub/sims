namespace sims.Models;

public class Incident
{
    public int Id { get; set; }


    //Incident Ersteller
    public int ReporterId { get; set; }

    //zugewiesener Bearbeiter
    public int AssigneeId { get; set; }

    public Severity Severity { get; set; } = Severity.Low;

    public IncidentStatus Status { get; set; } = IncidentStatus.New;

    public string? Cve { get; set; }

    //System bekommt keine eigene Tabelle weil die Angabe nicht präzisiert: System im allgemeinen, OS, Server??
    public string System { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    //automatisch aktuelle UTC-Zeit (Weltuhr) wird übernommen
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
