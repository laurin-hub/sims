namespace sims.Logging;

public class RedisLogEntry
{
    public required string Id { get; init; }

    public required DateTimeOffset Timestamp { get; init; }

    public required string LogLevel { get; init; }

    public required string Message { get; init; }
}
