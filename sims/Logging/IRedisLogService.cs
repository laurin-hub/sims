namespace sims.Logging;

public interface IRedisLogService
{
    // Nur kurze Ereignismeldungen - ohne Secrets, Request-Bodies oder sensible Nutzdaten zu übergeben.
    // true bedeutet, Redis hat den Schreibvorgang bestätigt.
    Task<bool> WriteAsync(LogLevel logLevel, string message);
}
