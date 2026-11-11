
# Phase 1: Build mit dem .NET 10 SDK
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY sims/sims.csproj sims/
RUN dotnet restore sims/sims.csproj

COPY sims/ sims/
RUN dotnet publish sims/sims.csproj -c Release --no-restore -o /app/publish /p:UseAppHost=false

# Phase 2: Laufzeitumgebung
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .

USER $APP_UID

ENTRYPOINT ["dotnet", "sims.dll"]
