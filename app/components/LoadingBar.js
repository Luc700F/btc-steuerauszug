"use client";

import { useEffect, useState } from "react";

// Animierter Fortschrittsbalken oben auf der Seite (ähnlich wie GitHub/YouTube)
export default function LoadingBar({ isLoading }) {
  const [breite, setBreite] = useState(0);
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    if (isLoading) {
      // Ladebalken einblenden und animieren
      setSichtbar(true);
      setBreite(15);

      const timer1 = setTimeout(() => setBreite(45), 800);
      const timer2 = setTimeout(() => setBreite(70), 3000);
      const timer3 = setTimeout(() => setBreite(88), 8000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      // Auf 100% setzen und dann ausblenden
      setBreite(100);
      const ausblenden = setTimeout(() => {
        setSichtbar(false);
        setBreite(0);
      }, 600);
      return () => clearTimeout(ausblenden);
    }
  }, [isLoading]);

  if (!sichtbar) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50"
      style={{ height: "3px", backgroundColor: "rgba(30, 58, 95, 0.2)" }}
    >
      <div
        style={{
          width: `${breite}%`,
          height: "100%",
          backgroundColor: "#F7931A",
          transition: "width 0.5s ease-out",
          boxShadow: "0 0 8px rgba(212, 160, 23, 0.6)",
        }}
      />
    </div>
  );
}
