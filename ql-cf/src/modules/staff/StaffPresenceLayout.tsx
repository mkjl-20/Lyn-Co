import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../shared/context/AuthContext";
import { supabaseClient } from "../../shared/lib/supabaseClient";

export function StaffPresenceLayout() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.isActive || currentUser.accountRole !== "staff") return;

    const channel = supabaseClient.channel("staff-online-presence", {
      config: { presence: { key: currentUser.id } },
    });
    let isMounted = true;

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Staff online presence connection failed:", status);
        }
        return;
      }

      const result = await channel.track({ userId: currentUser.id });
      if (result !== "ok" && isMounted) {
        console.error("Unable to publish staff online presence:", result);
      }
    });

    return () => {
      isMounted = false;
      void supabaseClient.removeChannel(channel);
    };
  }, [currentUser?.accountRole, currentUser?.id, currentUser?.isActive]);

  return <Outlet />;
}
