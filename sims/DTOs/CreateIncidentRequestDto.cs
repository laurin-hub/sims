using sims.Models;

namespace sims.DTOs;

public class CreateIncidentRequestDto
{
    public int AssigneeId { get; set; }

    public Severity Severity { get; set; } = Severity.Low;

    public string? Cve { get; set; }

    public string System { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
}
