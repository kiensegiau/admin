addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Chỉ cache video requests
  if (!url.pathname.startsWith('/api/proxy/files')) {
    return fetch(request)
  }

  const cache = caches.default
  let response = await cache.match(request)

  if (!response) {
    // Nếu không có trong Cloudflare cache, lấy từ NGINX
    response = await fetch(request, {
      cf: {
        cacheEverything: true,
        cacheTtl: 604800, // 7 days
      }
    })
  }

  return response
} 