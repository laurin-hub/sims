using sims.Models;

namespace sims.DTOs;

public class UpdateUserRequestDto
{
    public string Username { get; set; } = string.Empty;

    public UserRole Role { get; set; }

    public SupportLevel SupportLevel { get; set; }
}
