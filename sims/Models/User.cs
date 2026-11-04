namespace sims.Models;

public class User
{
    
    public int Id { get; set; }

    public string Username { get; set; } = string.Empty;

    //derweil wird leerer string generiert - hash kommt später
    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.User;

    //jeder neu erstellte User erhält automatisch Level 1
    public SupportLevel SupportLevel { get; set; } = SupportLevel.L1;

    public bool IsActive { get; set; } = true;
}
