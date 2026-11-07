using sims.Models;

namespace sims.DTOs;

public class UpdateIncidentRequestDto
{
    public Severity Severity { get; set; }

    public string System { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string? Cve { get; set; }

    public IncidentStatus? Status { get; set; }
}
