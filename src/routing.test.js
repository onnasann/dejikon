import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWalkingRoute } from './routing.js';

const start = [35.6931,139.7031];
const end = [35.6938,139.7043];
const response = { routes:[{ geometry:{type:'LineString',coordinates:[
  [139.7031,35.6931],[139.7035,35.6932],[139.7043,35.6938],
]},distance:198,duration:146 }] };

test('requests walking mode and converts every GeoJSON point for Leaflet', async () => {
  const result = await fetchWalkingRoute(start,end,{fetchImpl:async url => {
    const input = JSON.parse(url.searchParams.get('json'));
    assert.equal(input.costing,'pedestrian');
    assert.equal(input.shape_format,'geojson');
    assert.deepEqual(input.locations,[{lat:start[0],lon:start[1]},{lat:end[0],lon:end[1]}]);
    return {ok:true,json:async()=>response};
  }});
  assert.deepEqual(result.positions,[start,[35.6932,139.7035],end]);
  assert.equal(result.distance,198);
  assert.equal(result.duration,146);
});

test('rejects HTTP failures, absent routes, and malformed coordinates', async () => {
  await assert.rejects(fetchWalkingRoute(start,end,{fetchImpl:async()=>({ok:false,status:429})}),/HTTP 429/);
  for (const payload of [{routes:[]},{routes:[{...response.routes[0],geometry:{type:'LineString',coordinates:[[NaN,35],[139,35]]}}]}]) {
    await assert.rejects(fetchWalkingRoute(start,end,{fetchImpl:async()=>({ok:true,json:async()=>payload})}),/No valid walking route/);
  }
});

test('cancels an in-flight request when selection changes', async () => {
  const controller = new AbortController();
  const pending = fetchWalkingRoute(start,end,{signal:controller.signal,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  })});
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
});

test('invalid input and already cancelled requests never contact the API', async () => {
  const fetchImpl=async()=>{assert.fail('Unexpected network request');};
  await assert.rejects(fetchWalkingRoute([100,139],end,{fetchImpl}),/Invalid coordinates/);
  await assert.rejects(fetchWalkingRoute(start,end,{fetchImpl,signal:AbortSignal.abort()}),{name:'AbortError'});
});
