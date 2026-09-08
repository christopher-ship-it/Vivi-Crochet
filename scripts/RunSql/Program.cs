using Microsoft.Data.SqlClient;

var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings__DefaultConnection is not set.");

var sql = args.Length > 0
    ? await File.ReadAllTextAsync(args[0])
    : throw new InvalidOperationException("Pass a SQL file path.");

await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
await using var command = connection.CreateCommand();
command.CommandText = sql;
var affected = await command.ExecuteNonQueryAsync();
Console.WriteLine($"SQL executed. Rows affected: {affected}");
