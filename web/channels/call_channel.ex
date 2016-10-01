defmodule Broadcastr.CallChannel do
  use Phoenix.Channel
  alias Broadcastr.State
  require Logger

  def join("webrtc:client-" <> name, params, socket) do
    Logger.debug "join: name: #{name}, params: #{inspect params}"
    case State.get(name) do
      nil ->
        State.put name, %{}
        {:ok, socket}
      data ->
        Logger.error "join error: data: #{inspect data}"
        {:error, socket}
    end
  end

  def handle_out(event, msg, socket) do
    Logger.warn "handle_out topic: #{event}, msg: #{inspect msg}"
    {:reply, {:ok, msg}, socket}
  end

  def handle_in("client:webrtc-" <> nm, %{"type" => "stream-request", "name" => name} = msg, socket) do
    Logger.debug "Initiation requested by #{nm} to #{name}"
    case State.get nm do
      nil ->
        {:error, socket}
      data ->
        do_broadcast name, "stream-request", %{type: "initiate", name: nm}
    end
    {:noreply, socket}
  end

  def handle_in("client:webrtc-" <> nm, %{"type" => "offer", "name" => name, "offer" => offer} = msg, socket) do
    Logger.debug "Sending offer to #{name} from #{nm}"
    String.split(offer["sdp"], "\r\n")
    |> Enum.each(&(Logger.debug &1))
    # Logger.debug "offer #{name} #{inspect offer}"
    case State.get nm do
      nil -> :ok
      data -> 
        do_broadcast name, "offer", %{type: "offer", offer: msg["offer"], name: nm}
    end
    {:noreply, socket}
  end

  def handle_in("client:webrtc-" <> nm, %{"type" => "answer", "name" => name, "answer" => answer} = msg, socket) do
    Logger.debug "Sending answer to #{name} from #{nm}"
    # Logger.debug "answer #{name} #{inspect answer}"
    String.split(answer["sdp"], "\r\n")
    |> Enum.each(&(Logger.debug &1))
    case State.get nm do
      nil -> :ok
      data -> 
        do_broadcast name, "answer", %{type: "answer", answer: msg["answer"], name: nm}
    end
    {:noreply, socket}
  end

  def handle_in("client:webrtc-" <> nm, %{"type" => "leave", "name" => name} = msg, socket) do
    Logger.debug "Disconnecting from  #{name} by #{nm}"
    case State.get nm do
      nil -> :ok
      data -> 
        do_broadcast name, "leave", %{type: "leave", name: nm}
    end
    {:noreply, socket}
  end

  def handle_in("client:webrtc-" <> nm, %{"type" => "candidate", "name" => name, "candidate" => candidate} = msg, socket) do
    Logger.debug "Sending candidate to #{name}: #{inspect candidate} from #{nm}"
    do_broadcast name, "candidate", %{candidate: msg["candidate"], name: nm}
    {:noreply, socket}
  end

  def handle_in("client:webrtc-" <> nm, msg, socket) do
    type = msg["type"]
    Logger.debug "name: #{nm}, unknown type: #{type}, msg: #{inspect msg}"
    do_broadcast nm, "error", %{type: "error", message: "Unrecognized command: " <> type}
    {:noreply, socket}
  end

  def handle_in(topic, data, socket) do
    Logger.error "Unknown -- topic: #{topic}, data: #{inspect data}"
    {:noreply, socket}
  end

  defp do_broadcast(name, message, data) do
    Broadcastr.Endpoint.broadcast "webrtc:client-" <> name, "webrtc:" <> message, data
  end
end
