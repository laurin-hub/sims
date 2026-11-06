using sims.Models;

namespace sims.DTOs;

public class IncidentResponseDto
{
    public int Id { get; set; }

    public int ReporterId { get; set; }

    public int AssigneeId { get; set; }

    public Severity Severity { get; set; }

    public IncidentStatus Status { get; set; }

    public string? Cve { get; set; }

    public string System { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }
}
