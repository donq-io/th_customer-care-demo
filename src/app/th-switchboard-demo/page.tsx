"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { SessionStatus } from "../types";
import { useRealtimeSession } from "../hooks/useRealtimeSession";
import { RealtimeAgent } from "@openai/agents/realtime";
import {
  TranscriptProvider,
  useTranscript,
} from "../contexts/TranscriptContext";
import { v4 as uuidv4 } from "uuid";
import { EventProvider, useEvent } from "../contexts/EventContext";
import { FiPhoneCall } from "react-icons/fi";
import { FiPhone } from "react-icons/fi";

function ThSwitchboardDemo() {
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");
  const [micPermission, setMicPermission] = useState<
    "prompt" | "granted" | "denied" | "checking"
  >("checking");
  const [error, setError] = useState<string | null>(null);

  const { logClientEvent, logServerEvent } = useEvent();

  const sdkAudioElement = React.useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const el = document.createElement("audio");
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  }, []);

  useEffect(() => {
    if (sdkAudioElement && !audioElementRef.current) {
      audioElementRef.current = sdkAudioElement;
    }
  }, [sdkAudioElement]);

  useEffect(() => {
    const checkMicPermission = async () => {
      if (typeof navigator === "undefined" || !navigator.permissions) {
        setMicPermission("prompt");
        return;
      }

      try {
        const result = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        setMicPermission(result.state as "prompt" | "granted" | "denied");

        result.onchange = () => {
          setMicPermission(result.state as "prompt" | "granted" | "denied");
        };
      } catch (err) {
        setMicPermission("prompt");
      }
    };
    checkMicPermission();
  }, []);

  const { connect, disconnect, sendEvent } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    // don't put onAgentHandoff because not needed.
  });

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error("Failed to send via SDK", err);
    }
  };

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = await tokenResponse.json();
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const triggerAgentGreeting = () => {
    const id = uuidv4().slice(0, 32);

    sendClientEvent({
      type: "conversation.item.create",
      item: {
        id,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hi" }],
      },
    });
    sendClientEvent({ type: "response.create" }, "trigger initial greeting");
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    const turnDetection = {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      create_response: true,
    };
    sendEvent({
      type: "session.update",
      session: {
        turn_detection: turnDetection,
      },
    });

    if (shouldTriggerResponse) {
      triggerAgentGreeting();
    }
  };

  const requestMicrophoneAccess = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
      setError(null);
      return true;
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      setMicPermission("denied");
      setError(
        "Accesso al microfono negato; è necessario consentire l'uso del microfono per effettuare la chiamata."
      );
      return false;
    }
  };

  const connectToRealtime = async () => {
    if (sessionStatus !== "DISCONNECTED") return;
    setError(null);

    if (micPermission !== "granted") {
      const hasPermission = await requestMicrophoneAccess();
      if (!hasPermission) {
        return;
      }
    }
    setSessionStatus("CONNECTING");

    try {
      const EPHEMERAL_KEY = await fetchEphemeralKey();
      if (!EPHEMERAL_KEY) return;

      const switchboardAgent = new RealtimeAgent({
        name: "TH switchboard service",
        voice: "sage",
        instructions:
          "You are a switchboard operator for TH Resort, that first of all answers in italian and greet customer.",
      });

      await connect({
        getEphemeralKey: () => Promise.resolve(EPHEMERAL_KEY),
        initialAgents: [switchboardAgent],
        audioElement: sdkAudioElement,
      });
    } catch (err) {
      console.error("Error connecting:", err);
      setSessionStatus("DISCONNECTED");
    }
  };

  const disconnectFromRealtime = () => {
    disconnect();
    setSessionStatus("DISCONNECTED");
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
    } else {
      connectToRealtime();
    }
  };

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession(true);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (sessionStatus === "CONNECTED") {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }
  }, [sessionStatus]);

  const isConnected = sessionStatus === "CONNECTED";
  const isConnecting = sessionStatus === "CONNECTING";

  function getConnectionButtonLabel() {
    if (isConnecting || isConnected) return <FiPhoneCall />;
    return <FiPhone />;
  }

  function getConnectionButtonClasses() {
    const baseClasses =
      "max-h-min max-w-min text-white text-base p-10 rounded-full w-36 h-full text-3xl border border-transparent border-4 ";
    const cursorClass = isConnecting ? "cursor-not-allowed" : "cursor-pointer";

    if (isConnecting) {
      return `bg-yellow-600 ${cursorClass} ${baseClasses}`;
    }
    if (isConnected) {
      return `hover:bg-red-600 bg-green-600 ${cursorClass} ${baseClasses}`;
    }
    return `bg-black  hover:border-green-600  ${cursorClass} ${baseClasses}`;
  }
  return (
    <div className="flex flex-col gap-8 w-full justify-center items-center bg-gradient-to-b h-[100vh] from-[#1D3E6A] to-[#4A8AC1]">
      <Image
        src="/Logo_TH_Resorts_-_compl_neg.png"
        alt="TH Logo"
        width={400}
        height={400}
      />

      <button
        onClick={onToggleConnection}
        className={getConnectionButtonClasses()}
        disabled={isConnecting}
      >
        {getConnectionButtonLabel()}
      </button>
      <div className="flex flex-col items-center">
        {!isConnected && micPermission !== "granted" && (
          <div>
            Per effettuare la chiamata è necessario consentire l'accesso al
            microfono.
          </div>
        )}
        {error && (
          <div>
            Controlla le impostazioni del browser per abilitare il microfono.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <TranscriptProvider>
      <EventProvider>
        <ThSwitchboardDemo />
      </EventProvider>
    </TranscriptProvider>
  );
}
