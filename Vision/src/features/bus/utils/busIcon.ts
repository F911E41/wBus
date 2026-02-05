import L from "leaflet";

/**
 * Builds a leaflet DivIcon with a labeled bus badge. Escapes input to avoid XSS.
 */
export function buildBusIconWithLabel(routeNumber: string, fallback?: L.Icon | L.DivIcon | null) {
  if (typeof window === "undefined") return fallback ?? undefined;

  const escapeHtml = (text: string) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const escapedRouteNumber = escapeHtml(routeNumber);
  const needsMarquee = routeNumber.length > 3;
  const displayText = needsMarquee ? `${escapedRouteNumber} ${escapedRouteNumber}` : escapedRouteNumber;
  const animationClass = needsMarquee ? "bus-route-text-animate" : "";

  return L.divIcon({
    html: `
          <style>
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .bus-route-text-animate {
              display: inline-block;
              animation: marquee 3s linear infinite;
            }
            .bus-route-text-container:hover .bus-route-text-animate {
              animation-play-state: paused;
            }
          </style>
          <div style="position: relative; width: 29px; height: 43px; filter: drop-shadow(0 2px 8px rgba(37, 99, 235, 0.4));">
            <img src="/icons/bus-icon.png" style="width: 29px; height: 43px; transition: transform 0.3s ease;" />
            <div class="bus-route-text-container" style="
              position: absolute;
              top: 7px;
              left: 50%;
              transform: translateX(-50%);
              background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
              color: white;
              font-size: 10px;
              font-weight: bold;
              padding: 2px 5px;
              border-radius: 6px;
              border: 1.5px solid white;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
              letter-spacing: 0.3px;
              max-width: 24px;
              overflow: hidden;
              white-space: nowrap;
            ">
              <span class="${animationClass}">${displayText}</span>
            </div>
          </div>
        `,
    iconSize: [29, 43],
    iconAnchor: [14, 21],
    popupAnchor: [0, -21],
    className: "bus-marker-with-label",
  });
}
