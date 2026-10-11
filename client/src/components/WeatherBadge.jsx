import { useEffect, useState } from "react";

const DEFAULT_COORDS = { lat: 29.76, lon: -95.37, city: "Houston", state: "Texas" };

function describe(code) {
  if (code === 0) return "Sunny";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snowy";
  if ([95, 96, 99].includes(code)) return "Stormy";
  return "Cloudy";
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      return { city: DEFAULT_COORDS.city, state: DEFAULT_COORDS.state };
    }

    const data = await res.json();
    const place = data.results?.[0];
    if (!place) {
      return { city: DEFAULT_COORDS.city, state: DEFAULT_COORDS.state };
    }

    return {
      city: place.name || DEFAULT_COORDS.city,
      state: place.admin1 || place.country || DEFAULT_COORDS.state,
    };
  } catch {
    return { city: DEFAULT_COORDS.city, state: DEFAULT_COORDS.state };
  }
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: "temperature_2m,weather_code",
    temperature_unit: "fahrenheit",
    timezone: "auto",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Weather request failed");

  const data = await response.json();
  if (!data.current || typeof data.current.temperature_2m !== "number") {
    throw new Error("Weather data unavailable");
  }

  const tempF = Math.round(data.current.temperature_2m);
  const location = await reverseGeocode(lat, lon);

  return {
    tempF,
    description: describe(data.current.weather_code),
    city: location.city,
    state: location.state,
  };
}

export default function WeatherBadge({ onLoaded }) {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather(lat, lon) {
      try {
        const nextWeather = await fetchWeather(lat, lon);
        if (!cancelled) {
          setWeather(nextWeather);
          onLoaded?.(nextWeather);
        }
      } catch {
        const fallbackWeather = {
          tempF: Math.round((DEFAULT_COORDS.lat * 1.5) + 55),
          description: "Cloudy",
          city: DEFAULT_COORDS.city,
          state: DEFAULT_COORDS.state,
        };

        if (!cancelled) {
          setWeather(fallbackWeather);
          onLoaded?.(fallbackWeather);
        }
      }
    }

    if (!navigator.geolocation) {
      loadWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => loadWeather(coords.latitude, coords.longitude),
      () => loadWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );

    return () => {
      cancelled = true;
    };
  }, [onLoaded]);

  if (!weather) return <p>Loading weather...</p>;

  return (
    <div className="weather-badge">
      <strong>{weather.tempF}°F</strong>
      <div>{weather.description}</div>
      <div>{weather.city}, {weather.state}</div>
    </div>
  );
}
