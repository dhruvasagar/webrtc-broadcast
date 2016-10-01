defmodule Broadcastr.CallController do
  use Broadcastr.Web, :controller

  def index(conn, _params) do
    render conn, "index.html", name: ""
  end

  def show(conn, params) do
    render conn, "show.html", name: params["name"]
  end
end
