using sims.Models;

namespace sims.DTOs;

public class UserResponseDto
{
    public int Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public UserRole Role { get; set; }

    public SupportLevel SupportLevel { get; set; }

    public bool IsActive { get; set; }
}
