addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Cache key từ URL
  const cacheKey = new URL(request.url).pathname
  
  // Kiểm tra cache
  const cache = caches.default
  let response = await cache.match(request)

  if (!response) {
    // Nếu không có trong cache, forward đến origin
    response = await fetch(request)
    
    // Cache response
    if (response.status === 200) {
      response = new Response(response.body, response)
      response.headers.set('Cache-Control', 'public, max-age=14400') // 4 giờ
      event.waitUntil(cache.put(request, response.clone()))
    }
  }

  return response
} 