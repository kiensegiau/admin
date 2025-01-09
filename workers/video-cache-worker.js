addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const cache = caches.default
  
  // Chỉ cache video requests
  if (!url.pathname.startsWith('/api/proxy/files')) {
    return fetch(request)
  }

  let response = await cache.match(request)

  if (response) {
    // Cache hit
    response = new Response(response.body, response)
    response.headers.set('X-Cache-Location', 'Cloudflare')
    response.headers.set('CF-Cache-Status', 'HIT')
  } else {
    // Cache miss - fetch từ origin
    response = await fetch(request, {
      cf: {
        cacheEverything: true,
        cacheTtl: 604800, // 7 days
      }
    })
    
    // Cache response mới
    if (response.status === 200) {
      response = new Response(response.body, response) 
      response.headers.set('Cache-Control', 'public, max-age=14400') // 4 giờ
      response.headers.set('CF-Cache-Status', 'MISS')
      event.waitUntil(cache.put(request, response.clone()))
    }
  }

  return response
} 