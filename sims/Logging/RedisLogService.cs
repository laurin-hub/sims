using System.Text.Json;
using StackExchange.Redis;

namespace sims.Logging;

public sealed class RedisLogService : IRedisLogService, IDisposable
{
    private readonly Func<Task<IConnectionMultiplexer>> _connectionFactory;
    private readonly ILogger<RedisLogService> _logger;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private IConnectionMultiplexer? _connection;

    public RedisLogService(
        Func<Task<IConnectionMultiplexer>> connectionFactory,
        ILogger<RedisLogService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<bool> WriteAsync(LogLevel logLevel, string message)
    {
        if (!Enum.IsDefined(logLevel) || logLevel == LogLevel.None || string.IsNullOrWhiteSpace(message))
        {
            _logger.LogWarning("Redis-Logeintrag wegen ungültiger Stufe oder leerer Nachricht verworfen");
            return false;
        }

        try
        {
            var entry = new RedisLogEntry
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow,
                LogLevel = logLevel.ToString(),
                Message = message.Trim()
            };
            var json = JsonSerializer.Serialize(entry);
            var connection = await GetConnectionAsync();

            await connection.GetDatabase().ListRightPushAsync("sims:logs", json);
            return true;
        }
        catch (Exception)
        {
            // Keine Exception-Details ausgeben: Sie könnten Verbindungsdaten enthalten.
            _logger.LogError(
                "Redis-Protokollierung nicht bestätigt, Konfiguration und Redis-Verfügbarkeit prüfen");
            return false;
        }
    }

    private async Task<IConnectionMultiplexer> GetConnectionAsync()
    {
        if (!await _connectionLock.WaitAsync(TimeSpan.FromSeconds(2)))
        {
            throw new TimeoutException("Redis-Verbindungsaufbau ist noch belegt.");
        }

        try
        {
            // Nur der erste Aufruf verbindet; der Multiplexer übernimmt spätere Wiederverbindungen.
            // Schlägt die Erzeugung fehl, kann ein späterer Logaufruf sie erneut versuchen.
            _connection ??= await _connectionFactory();
            return _connection;
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    public void Dispose()
    {
        _connection?.Dispose();
        _connectionLock.Dispose();
    }
}
