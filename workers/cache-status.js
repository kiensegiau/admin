addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Kiểm tra Cloudflare cache
  const cache = caches.default
  let response = await cache.match(request)
  
  if (response) {
    // Nếu hit Cloudflare cache
    response = new Response(response.body, response)
    response.headers.set('X-Cache-Location', 'Cloudflare')
    response.headers.set('CF-Cache-Status', 'HIT')
  } else {
    // Nếu miss, forward đến origin
    response = await fetch(request)
    response = new Response(response.body, response)
    response.headers.set('CF-Cache-Status', 'MISS')
  }
  
  return response
} 