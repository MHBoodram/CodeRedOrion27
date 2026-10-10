import { useEffect, useState } from "react";

const DEFAULT_COORDS = { lat: 29.76, lon: -95.37, city: "Houston", state: "Texas" };

function describe(code) {
  if (code === 0) return "Sunny";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if (code >= 51 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Rainy";
  if (code >= 95) return "Stormy";
  return "Cloudy";
}

async function reverseGeocode(lat, lon) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return { city: "Local", state: "Area" };

  const data = await res.json();
  const place = data.results?.[0];
  if (!place) return { city: "Local", state: "Area" };

  return {
    city: place.name || "Local",
    state: place.admin1 || place.country || "Area",
  };
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");

  const data = await res.json();
  const tempF = Math.round(data.current.temperature_2m);
  const description = describe(data.current.weather_code);
  const location = await reverseGeocode(lat, lon);

  return { tempF, description, city: location.city, state: location.state };
}

export default function WeatherBadge({ onLoaded }) {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load(lat, lon) {
      try {
        const data = await fetchWeather(lat, lon);
        if (active) {
          setWeather(data);
          onLoaded?.(data);
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }

    async function fallback() {
      try {
        const defaultWeather = await fetchWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon);
        if (active) {
          setWeather(defaultWeather);
          onLoaded?.(defaultWeather);
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }

    fallback();

    if (!navigator.geolocation) {
      return () => {
        active = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude),
      () => fallback(),
    );

    return () => {
      active = false;
    };
  }, [onLoaded]);

  if (error) return <p>Weather unavailable: {error}</p>;
  if (!weather) return <p>Loading weather...</p>;

  return (
    <div className="weather-badge">
      <strong>{weather.tempF}°F</strong>
      <div>{weather.description}</div>
      <div>{weather.city}, {weather.state}</div>
    </div>
  );
}
