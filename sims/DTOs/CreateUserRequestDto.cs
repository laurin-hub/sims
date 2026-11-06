using sims.Models;

namespace sims.DTOs;

public class CreateUserRequestDto
{
    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.User;

    public SupportLevel SupportLevel { get; set; } = SupportLevel.L1;
}
