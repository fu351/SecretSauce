self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || "Secret Sauce"
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon",
    badge: data.badge || "/icon",
    tag: data.tag,
    data: {
      url: data.url || "/dashboard",
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const url = event.notification?.data?.url || "/dashboard"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url.includes(url)) {
          return client.focus()
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url)
      }
      return undefined
    })
  )
})
