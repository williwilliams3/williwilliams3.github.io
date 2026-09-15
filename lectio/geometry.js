// Scientific geometry shared by the animated deck and numerical checks.
// UMD-style export keeps the built deck usable by opening index.html offline.
(function (scope) {
  const H = [[1 / Math.sqrt(2), -1 / Math.sqrt(2), 0],
    [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)]];
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  function ilr(p) {
    if (p.length !== 3 || p.some(x => x <= 0)) throw new RangeError('ILR requires three strictly positive components.');
    return H.map(row => row.reduce((sum, h, i) => sum + h * Math.log(p[i]), 0));
  }
  function inverseIlr(z) {
    const logs = H[0].map((_, i) => H[0][i] * z[0] + H[1][i] * z[1]);
    const max = Math.max(...logs);
    const e = logs.map(x => Math.exp(x - max));
    const sum = e.reduce((a, b) => a + b, 0);
    return e.map(x => x / sum);
  }
  function aitchisonDistance(a, b) {
    const logratios = a.map((x, i) => Math.log(x / b[i]));
    const mean = logratios.reduce((a, b) => a + b, 0) / a.length;
    return Math.hypot(...logratios.map(x => x - mean));
  }
  function interpolateCategory(k, noise, lambda = 0.5) {
    return noise.map((x, i) => (1 - lambda) * x + (i === k ? lambda : 0));
  }
  function argmax(p) { return p.indexOf(Math.max(...p)); }
  function rng(seed = 48293) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function normal(random) { return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random()); }
  function dirichlet(random, alpha = 4) {
    const values = Array.from({ length: 3 }, () => {
      let sum = 0; for (let i = 0; i < alpha; i++) sum -= Math.log(Math.max(1e-12, random())); return sum;
    });
    const sum = values.reduce((a, b) => a + b, 0);
    return values.map(x => x / sum);
  }
  function cholesky(matrix,jitter=0) {
    const n=matrix.length,L=Array.from({length:n},()=>Array(n).fill(0));
    for(let i=0;i<n;i++)for(let j=0;j<=i;j++) {
      let value=matrix[i][j]+(i===j?jitter:0);
      for(let k=0;k<j;k++)value-=L[i][k]*L[j][k];
      if(i===j) {
        if(value<=0||!Number.isFinite(value))throw new Error('Matrix is not positive definite');
        L[i][j]=Math.sqrt(value);
      } else L[i][j]=value/L[j][j];
    }
    return L;
  }
  function solveLower(L,b) {
    const x=Array(b.length).fill(0);
    for(let i=0;i<b.length;i++) {
      let value=b[i];for(let j=0;j<i;j++)value-=L[i][j]*x[j];x[i]=value/L[i][i];
    }
    return x;
  }
  function solveCholesky(L,b) {
    const y=solveLower(L,b),x=Array(b.length).fill(0);
    for(let i=b.length-1;i>=0;i--) {
      let value=y[i];for(let j=i+1;j<b.length;j++)value-=L[j][i]*x[j];x[i]=value/L[i][i];
    }
    return x;
  }
  function gaussianProcessPosterior(trainX,trainY,queryX,{lengthScale=1,signalVariance=1,noiseStd=.08,sampleCount=7,seed=9317}={}) {
    if(!trainX.length||trainX.length!==trainY.length||!queryX.length||lengthScale<=0||signalVariance<=0||noiseStd<0||sampleCount<0)throw new RangeError('Invalid Gaussian process inputs');
    const kernel=(a,b)=>signalVariance*Math.exp(-.5*((a-b)/lengthScale)**2);
    const training=trainX.map((x,i)=>trainX.map((z,j)=>kernel(x,z)+(i===j?noiseStd**2:0)));
    const factor=cholesky(training,1e-10),alpha=solveCholesky(factor,trainY);
    const cross=queryX.map(x=>trainX.map(z=>kernel(x,z)));
    const projected=cross.map(row=>solveLower(factor,row));
    const mean=cross.map(row=>row.reduce((sum,value,i)=>sum+value*alpha[i],0));
    const covariance=queryX.map((x,i)=>queryX.map((z,j)=>kernel(x,z)-projected[i].reduce((sum,value,k)=>sum+value*projected[j][k],0)));
    const sampleFactor=cholesky(covariance,1e-8),random=rng(seed);
    const samples=Array.from({length:sampleCount},()=>{
      const white=Array.from({length:queryX.length},()=>normal(random));
      return mean.map((value,i)=>value+sampleFactor[i].slice(0,i+1).reduce((sum,a,j)=>sum+a*white[j],0));
    });
    return {mean,covariance,samples};
  }
  // A bijective banana map. Its Jacobian determinant is constant (0.48).
  // F(t*z) is an exact geodesic of the metric induced by inverse F.
  const banana = ([u, v]) => [0.45 * u * u + 0.48 * v - 1.3, u];
  const inverseBanana = ([x, y]) => [y, (x + 1.3 - 0.45 * y * y) / 0.48];
  function bananaDensity(x, y) { const z = inverseBanana([x, y]); return Math.exp(-0.5 * (z[0] ** 2 + z[1] ** 2)); }
  // An invented, smooth mountain range. Keep its displayed height fixed while
  // the Monge metric I + alpha^2 grad(h) grad(h)^T controls movement in the map.
  function terrain(x, y) {
    let height = .08, dx = 0, dy = 0, dxx = 0, dxy = 0, dyy = 0;
    for (const [cx, cy, amplitude, wx, wy] of [
      [-1.3, .45, 3.0, 1.0, .85],
      [1.5, .2, 2.25, .7, .75],
      [-.4, 1.8, 1.7, .8, .7],
    ]) {
      const value = amplitude * Math.exp(-((x-cx)**2/wx + (y-cy)**2/wy));
      height += value;
      dx -= 2*(x-cx)/wx*value;
      dy -= 2*(y-cy)/wy*value;
      dxx += (4*(x-cx)**2/wx**2-2/wx)*value;
      dxy += 4*(x-cx)*(y-cy)/(wx*wy)*value;
      dyy += (4*(y-cy)**2/wy**2-2/wy)*value;
    }
    return {height, dx, dy, dxx, dxy, dyy};
  }
  const terrainPoint = ([x,y]) => [x,y,terrain(x,y).height];
  function terrainSegmentLength(a, b, alpha=1) {
    // Simpson integration of the Monge metric along a segment in the map.
    const dx=b[0]-a[0], dy=b[1]-a[1];
    const speed=t=>{
      const g=terrain(a[0]+t*dx,a[1]+t*dy);
      return Math.hypot(dx,dy,alpha*(g.dx*dx+g.dy*dy));
    };
    return (speed(0)+4*speed(.5)+speed(1))/6;
  }
  const terrainPathLength = (path,alpha=1) => path.slice(1).reduce((sum,p,i)=>sum+terrainSegmentLength(path[i],p,alpha),0);
  function mongeAcceleration(q,v,alpha=1) {
    const g=terrain(...q),a2=alpha*alpha;
    const curvature=g.dxx*v[0]**2+2*g.dxy*v[0]*v[1]+g.dyy*v[1]**2;
    const factor=-a2*curvature/(1+a2*(g.dx*g.dx+g.dy*g.dy));
    return [factor*g.dx,factor*g.dy];
  }
  function mongeSpeed(q,v,alpha=1) {
    const g=terrain(...q);
    return Math.hypot(...v,alpha*(g.dx*v[0]+g.dy*v[1]));
  }
  function solveMongeBoundary(initial,alpha) {
    // Centred collocation of q'' = -Gamma(q)[q',q'], with both endpoints fixed.
    // Damped Newton solves the 2x2 block-tridiagonal system. The graph/energy
    // route is only an initial guess, not the trajectory used for animation.
    const dt=1/(initial.length-1),dt2=dt*dt,epsilon=1e-5;
    const residual=path=>path.slice(1,-1).map((q,j)=>{
      const i=j+1,v=q.map((_,k)=>(path[i+1][k]-path[i-1][k])/(2*dt));
      const a=mongeAcceleration(q,v,alpha);
      return q.map((value,k)=>path[i-1][k]-2*value+path[i+1][k]-dt2*a[k]);
    });
    const norm=values=>Math.max(...values.flat().map(Math.abs))/dt2;
    const multiply=(a,b)=>[a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3]];
    const apply=(a,v)=>[a[0]*v[0]+a[1]*v[1],a[2]*v[0]+a[3]*v[1]];
    const inverse=a=>{const det=a[0]*a[3]-a[1]*a[2];if(Math.abs(det)<1e-14)throw new Error('Singular Monge boundary solve');return [a[3]/det,-a[1]/det,-a[2]/det,a[0]/det];};
    let path=initial.map(q=>q.slice()),error=norm(residual(path)),iterations=0;
    for(;iterations<35&&error>1e-7;iterations++) {
      const values=residual(path),upper=[],rhs=[];
      for(let i=1;i<path.length-1;i++) {
        const q=path[i],v=q.map((_,k)=>(path[i+1][k]-path[i-1][k])/(2*dt)),g=terrain(...q);
        const factor=-alpha*alpha/(1+alpha*alpha*(g.dx*g.dx+g.dy*g.dy));
        const hv=[g.dxx*v[0]+g.dxy*v[1],g.dxy*v[0]+g.dyy*v[1]];
        const jv=[2*factor*g.dx*hv[0],2*factor*g.dx*hv[1],2*factor*g.dy*hv[0],2*factor*g.dy*hv[1]],jq=[0,0,0,0];
        for(let k=0;k<2;k++) {
          const plus=q.slice(),minus=q.slice();plus[k]+=epsilon;minus[k]-=epsilon;
          const a=mongeAcceleration(plus,v,alpha),b=mongeAcceleration(minus,v,alpha);
          jq[k]=(a[0]-b[0])/(2*epsilon);jq[2+k]=(a[1]-b[1])/(2*epsilon);
        }
        const identity=[1,0,0,1];
        const lower=identity.map((value,k)=>value+dt/2*jv[k]);
        let diagonal=identity.map((value,k)=>-2*value-dt2*jq[k]);
        const next=identity.map((value,k)=>value-dt/2*jv[k]);
        let right=values[i-1].map(value=>-value);
        if(i>1) {
          diagonal=diagonal.map((value,k)=>value-multiply(lower,upper[i-2])[k]);
          right=right.map((value,k)=>value-apply(lower,rhs[i-2])[k]);
        }
        const inv=inverse(diagonal);upper.push(multiply(inv,next));rhs.push(apply(inv,right));
      }
      const delta=rhs.map(v=>v.slice());
      for(let i=delta.length-2;i>=0;i--)delta[i]=delta[i].map((v,k)=>v-apply(upper[i],delta[i+1])[k]);
      let accepted=false;
      for(let scale=1;scale>=1/1024;scale/=2) {
        const candidate=path.map((q,i)=>i===0||i===path.length-1?q:q.map((v,k)=>v+scale*delta[i-1][k]));
        const nextError=norm(residual(candidate));
        if(Number.isFinite(nextError)&&nextError<error) {path=candidate;error=nextError;accepted=true;break;}
      }
      if(!accepted)break;
    }
    if(error>1e-6)throw new Error(`Monge boundary solve did not converge: ${error}`);
    return {path,residual:error,iterations};
  }
  function terrainRoute({step=.1,alpha=1,segments=240}={}) {
    if(!Number.isFinite(alpha)||alpha<0||step<=0||!Number.isInteger(segments)||segments<8)throw new RangeError('Invalid Monge route parameters');
    // A* and a short energy relaxation select a low-length initial branch.
    // The boundary-value geodesic equation below determines the final route.
    const nx=Math.round(9/step), ny=Math.round(5.2/step), width=nx+1;
    const at=id=>[-4.5+9*(id%width)/nx,-2.6+5.2*Math.floor(id/width)/ny];
    const idOf=(x,y)=>Math.round((y+2.6)/5.2*ny)*width+Math.round((x+4.5)/9*nx);
    const start=idOf(-4,0), goal=idOf(4,0), goalPoint=at(goal);
    const distance=new Float64Array(width*(ny+1)).fill(Infinity);
    const previous=new Int32Array(distance.length).fill(-1), heap=[];
    const push=entry=>{
      heap.push(entry);let i=heap.length-1;
      while(i>0){const p=(i-1)>>1;if(heap[p].score<=entry.score)break;heap[i]=heap[p];i=p;}
      heap[i]=entry;
    };
    const pop=()=>{
      const first=heap[0],last=heap.pop();
      if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(heap[c].score>=last.score)break;heap[i]=heap[c];i=c;}heap[i]=last;}
      return first;
    };
    const moves=[];
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(x||y)moves.push([x,y]);
    for(const x of [-1,1])for(const y of [-1,1])moves.push([x,2*y],[2*x,y]);
    distance[start]=0;push({id:start,distance:0,score:0});
    while(heap.length) {
      const current=pop(),id=current.id;
      if(current.distance!==distance[id])continue;
      if(id===goal)break;
      const x=id%width,y=Math.floor(id/width),a=at(id);
      for(const [dx,dy] of moves) {
        const xx=x+dx,yy=y+dy;if(xx<0||xx>nx||yy<0||yy>ny)continue;
        const next=yy*width+xx,b=at(next),candidate=distance[id]+terrainSegmentLength(a,b,alpha);
        if(candidate<distance[next]) {
          distance[next]=candidate;previous[next]=id;
          // Map distance is a lower bound even for the quadrature edge weights.
          const heuristic=Math.hypot(b[0]-goalPoint[0],b[1]-goalPoint[1]);
          push({id:next,distance:candidate,score:candidate+heuristic});
        }
      }
    }
    let path=[];
    for(let id=goal;id!==-1;id=previous[id])path.push(at(id));
    path.reverse();
    const graphLength=terrainPathLength(path,alpha);
    const resample=(points,count)=>{
      const lengths=[0];
      for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+terrainSegmentLength(points[i-1],points[i],alpha));
      let j=1;
      return Array.from({length:count},(_,i)=>{
        const s=lengths.at(-1)*i/(count-1);while(j<points.length-1&&lengths[j]<s)j++;
        return mix(points[j-1],points[j],(s-lengths[j-1])/(lengths[j]-lengths[j-1]));
      });
    };
    path=resample(path,81);
    const energy=points=>points.slice(1).reduce((sum,p,i)=>{
      const a=terrainPoint(points[i]),b=terrainPoint(p);
      return sum+b.reduce((s,v,j)=>s+(j===2?alpha*alpha:1)*(v-a[j])**2,0);
    },0);
    let rate=.025;
    for(let iteration=0;iteration<900;iteration++) {
      const points=path.map(terrainPoint),oldEnergy=energy(path);
      const gradients=path.map((p,i)=>{
        if(i===0||i===path.length-1)return [0,0];
        const g=terrain(...p),d=points[i].map((v,j)=>2*(2*v-points[i-1][j]-points[i+1][j]));
        return [d[0]+alpha*alpha*d[2]*g.dx,d[1]+alpha*alpha*d[2]*g.dy];
      });
      const candidate=path.map((p,i)=>p.map((v,j)=>clamp(v-rate*gradients[i][j],j===0?-4.5:-2.6,j===0?4.5:2.6)));
      if(energy(candidate)<=oldEnergy){path=candidate;rate=Math.min(.08,rate*1.03);}else rate*=.5;
    }
    const solution=solveMongeBoundary(resample(path,segments+1),alpha);
    path=solution.path;
    const dt=1/segments;
    const velocities=path.map((q,i)=>{
      if(i===0)return q.map((v,k)=>(-3*v+4*path[1][k]-path[2][k])/(2*dt));
      if(i===segments)return q.map((v,k)=>(3*v-4*path[i-1][k]+path[i-2][k])/(2*dt));
      return q.map((_,k)=>(path[i+1][k]-path[i-1][k])/(2*dt));
    });
    const state=t=>{
      const position=clamp(t)*segments,i=Math.min(segments-1,Math.floor(position)),u=position-i;
      const q=path[i].map((a,k)=>(2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*dt*velocities[i][k]+(-2*u**3+3*u*u)*path[i+1][k]+(u**3-u*u)*dt*velocities[i+1][k]);
      const v=path[i].map((a,k)=>((6*u*u-6*u)*a+(3*u*u-4*u+1)*dt*velocities[i][k]+(-6*u*u+6*u)*path[i+1][k]+(3*u*u-2*u)*dt*velocities[i+1][k])/dt);
      return {q,v};
    };
    const startPoint=path[0],endPoint=path.at(-1);
    return {alpha,path,length:terrainPathLength(path,alpha),graphLength,start:startPoint,end:endPoint,state,
      residual:solution.residual,iterations:solution.iterations,
      at:t=>terrainPoint(state(t).q),
      straightAt:t=>mix(terrainPoint(startPoint),terrainPoint(endPoint),clamp(t)),
    };
  }
  function undergroundOpacity(point) {
    const depth=terrain(point[0],point[1]).height-point[2];
    const fraction=clamp(depth/.18),fade=fraction*fraction*(3-2*fraction);
    return 1-.78*fade;
  }
  function inverseMetricTraversal(count = 500) {
    // Symmetric 2-D Gaussian mixture restricted to y=0: the symmetry axis
    // is an actual geodesic. G_inv = ((p+lambda)/(p0+lambda))^2 I.
    // Constant metric speed gives dx/ds proportional to 1/(p+lambda).
    const density = x => Math.exp(-0.5 * ((x + 2.1) / 0.6) ** 2) + Math.exp(-0.5 * ((x - 2.1) / 0.6) ** 2);
    const lambda = 0.075;
    const xs = [], cumulative = [0];
    for (let i = 0; i <= count; i++) xs.push(-2.1 + 4.2 * i / count);
    for (let i = 1; i <= count; i++) cumulative[i] = cumulative[i - 1] + (density(xs[i]) + density(xs[i - 1]) + 2 * lambda) * (xs[i] - xs[i - 1]) / 2;
    const total = cumulative[count];
    return function at(t) {
      const distance = clamp(t) * total;
      let lo = 0, hi = count;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] < distance) lo = mid; else hi = mid; }
      const f = (distance - cumulative[lo]) / (cumulative[hi] - cumulative[lo]);
      const x = xs[lo] + f * (xs[hi] - xs[lo]);
      return { x, speed: (1 + lambda) / (density(x) + lambda) };
    };
  }
  const flowCenters = [0,1,2].map(k=>ilr(interpolateCategory(k,[1/3,1/3,1/3],0.65)));
  function mixtureVelocity(z,t) {
    // Analytic conditional-flow-matching field for independent Gaussian source
    // and three-component Gaussian-mixture target. This is NOT a trained model.
    const s0=.7,s1=.17,v=(1-t)**2*s0*s0+t*t*s1*s1;
    const slope=(t*s1*s1-(1-t)*s0*s0)/v;
    const logs=flowCenters.map(m=>-((z[0]-t*m[0])**2+(z[1]-t*m[1])**2)/(2*v));
    const largest=Math.max(...logs),w=logs.map(a=>Math.exp(a-largest)),sum=w.reduce((a,b)=>a+b,0);
    return [0,1].map(j=>flowCenters.reduce((a,m,k)=>a+w[k]/sum*(m[j]+slope*(z[j]-t*m[j])),0));
  }
  function mixtureFlow(start,steps=160) {
    const points=[start.slice()],dt=1/steps;
    for(let i=0;i<steps;i++) {
      const x=points[i],t=i*dt,k1=mixtureVelocity(x,t);
      const k2=mixtureVelocity(x.map((v,j)=>v+dt*k1[j]/2),t+dt/2);
      const k3=mixtureVelocity(x.map((v,j)=>v+dt*k2[j]/2),t+dt/2);
      const k4=mixtureVelocity(x.map((v,j)=>v+dt*k3[j]),t+dt);
      points.push(x.map((v,j)=>v+dt/6*(k1[j]+2*k2[j]+2*k3[j]+k4[j])));
    }
    return points;
  }
  scope.LectioGeometry = { H, clamp, mix, ilr, inverseIlr, aitchisonDistance, interpolateCategory, argmax, rng, normal, dirichlet, gaussianProcessPosterior, banana, inverseBanana, bananaDensity, terrain, terrainPoint, terrainSegmentLength, terrainPathLength, terrainRoute, mongeAcceleration, mongeSpeed, undergroundOpacity, inverseMetricTraversal, flowCenters, mixtureVelocity, mixtureFlow };
})(typeof window === 'undefined' ? globalThis : window);
