/* Animated mathematical explanations. See README.md for construction details. */
(() => {
  'use strict';
  const G = window.LectioGeometry;
  const C = { paper:'#faf9f6', ink:'#20333c', muted:'#687c80', line:'#d4deda', teal:'#197f7b', orange:'#cf704c', blue:'#597bb8', pale:'#e5efea' };
  const colors = [C.teal, C.orange, C.blue];
  const letters = ['A', 'B', 'C'];
  const tau = 2 * Math.PI;
  const ease = t => { t = G.clamp(t); return t * t * (3 - 2 * t); };
  const frac = (seconds, start, duration) => ease((seconds - start) / duration);
  const printMode = /print-pdf/i.test(location.search);
  const stillMode = new URLSearchParams(location.search).has('static');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches || stillMode;
  let paused = false, active = null, elapsed = 0, previousTime = 0, request = 0;
  const random = G.rng(830412);
  const gaussian = Array.from({length:480}, () => [G.normal(random), G.normal(random)]);
  const categoryPoints = Array.from({length:240}, (_, i) => {
    const k = i % 3;
    const p = G.interpolateCategory(k, G.dirichlet(random), 0.5);
    return { k, p, z:G.ilr(p), base:[G.normal(random) * 0.52, G.normal(random) * 0.52] };
  });
  const inverseTraversal = G.inverseMetricTraversal();
  const mountainAlpha = .2;
  const mountainRoute = G.terrainRoute({alpha:mountainAlpha});
  const flowPaths=gaussian.slice(0,240).map(z=>{
    const path=G.mixtureFlow(z.map(a=>a*.7));
    return {path,k:G.argmax(G.inverseIlr(path.at(-1)))};
  });
  const sections = [...document.querySelectorAll('.slides > section')];

  function text(ctx, value, x, y, size=24, color=C.ink, align='left', weight=400) {
    ctx.save(); ctx.font = `${weight} ${size}px "Adwaita Sans", "Helvetica Neue", Arial, sans-serif`; ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='middle'; ctx.fillText(value,x,y); ctx.restore();
  }
  function line(ctx, points, color=C.line, width=1.5, alpha=1, dash=[]) {
    if (!points.length) return;
    ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.lineWidth=width; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.setLineDash(dash); ctx.beginPath();
    points.forEach((p,i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke(); ctx.restore();
  }
  function dot(ctx, p, radius=4, color=C.teal, alpha=1) {
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=color; ctx.beginPath(); ctx.arc(p[0],p[1],radius,0,tau); ctx.fill(); ctx.restore();
  }
  function ring(ctx, p, radius, color=C.teal, alpha=1, width=1.4) {
    ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.arc(...p,radius,0,tau); ctx.stroke(); ctx.restore();
  }
  function polygon(ctx, pts, fill, alpha=1) {
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=fill; ctx.beginPath(); pts.forEach((p,i) => i ? ctx.lineTo(...p):ctx.moveTo(...p)); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function chart(x,y,w,h,xmin=-3,xmax=3,ymin=-3,ymax=3) {
    return {x,y,w,h, map:p=>[x+(p[0]-xmin)/(xmax-xmin)*w, y+h-(p[1]-ymin)/(ymax-ymin)*h]};
  }
  function grid(ctx,ch,range=3) {
    for(let a=-range;a<=range;a++) {
      line(ctx,[ch.map([a,-range]),ch.map([a,range])],C.line,1,a===0?.8:.45);
      line(ctx,[ch.map([-range,a]),ch.map([range,a])],C.line,1,a===0?.8:.45);
    }
  }
  function triangle(cx,cy,side) {
    const height=side*Math.sqrt(3)/2;
    const v=[[cx,cy-height/2],[cx-side/2,cy+height/2],[cx+side/2,cy+height/2]];
    return {v,cx,cy,side, map:p=>[p.reduce((s,a,i)=>s+a*v[i][0],0),p.reduce((s,a,i)=>s+a*v[i][1],0)]};
  }
  function drawTriangle(ctx,tr,{labels=true,gridLines=false,alpha=1}={}) {
    if(gridLines) for(let k=0;k<3;k++) for(let t=.2;t<1;t+=.2) {
      const p=[0,0,0],q=[0,0,0]; p[k]=t;q[k]=t;p[(k+1)%3]=1-t;q[(k+2)%3]=1-t;
      line(ctx,[tr.map(p),tr.map(q)],C.line,1,.55*alpha);
    }
    line(ctx,[...tr.v,tr.v[0]],C.ink,1.8,alpha);
    if(labels) {
      text(ctx,'A',tr.v[0][0],tr.v[0][1]-23,25,colors[0],'center',500);
      text(ctx,'B',tr.v[1][0]-22,tr.v[1][1]+11,25,colors[1],'center',500);
      text(ctx,'C',tr.v[2][0]+22,tr.v[2][1]+11,25,colors[2],'center',500);
    }
  }
  function contour(ctx,ch,r,color=C.teal,alpha=.2) {
    const pts=Array.from({length:201},(_,i)=>ch.map(G.banana([r*Math.cos(i/200*tau),r*Math.sin(i/200*tau)])));
    line(ctx,pts,color,1.6,alpha);
  }
  function bananaPlot(ctx,ch,cloud=false,alpha=1) {
    ctx.save(); ctx.beginPath();ctx.rect(ch.x,ch.y,ch.w,ch.h);ctx.clip();
    if(cloud) gaussian.forEach(z=>dot(ctx,ch.map(G.banana(z)),2.5,C.teal,.14*alpha));
    [.55,1.1,1.65,2.2,2.75].forEach(r=>contour(ctx,ch,r,C.teal,.46*alpha));
    ctx.restore();
  }
  function arcPath(ctx,fn,t,color,width=3,alpha=1) {
    const n=Math.max(2,Math.ceil(t*150)); line(ctx,Array.from({length:n},(_,i)=>fn(t*i/(n-1))),color,width,alpha);
  }
  function legend(ctx,label,x,y,color) { dot(ctx,[x,y],4,color); text(ctx,label,x+14,y,21,C.muted); }

  const mountainProject=([x,y,z])=>[640+106*x+31*y,274-68*y-68*z];
  let mountainBackdrop;
  function drawMountainTerrain(ctx) {
    if(!mountainBackdrop) {
      mountainBackdrop=document.createElement('canvas');mountainBackdrop.width=1280;mountainBackdrop.height=490;
      const paint=mountainBackdrop.getContext('2d'),faces=[],nx=90,ny=52;
      for(let i=0;i<nx;i++)for(let j=0;j<ny;j++) {
        const x=-4.5+i*.1,y=-2.6+j*.1,g=G.terrain(x+.05,y+.05);
        const light=(-.5*-g.dx-.7*-g.dy+1)/Math.hypot(g.dx,g.dy,1)/Math.hypot(.5,.7,1);
        const tone=G.clamp(g.height/3),shade=.78+.26*Math.max(0,light);
        const base=tone<.48?G.mix([216,229,215],[153,179,159],tone/.48):G.mix([153,179,159],[243,240,225],(tone-.48)/.52);
        const color=`rgb(${base.map(v=>Math.round(v*shade)).join(',')})`;
        const points=[[x,y],[x+.1,y],[x+.1,y+.1],[x,y+.1]].map(p=>mountainProject(G.terrainPoint(p)));
        faces.push({depth:y-.292*x,points,color,grid:i%4===0||j%4===0});
      }
      faces.sort((a,b)=>b.depth-a.depth);
      for(const face of faces) {
        polygon(paint,face.points,face.color);
        line(paint,[...face.points,face.points[0]],face.color,.8);
        if(face.grid)line(paint,face.points.slice(0,2),C.teal,.55,.13);
      }
      const edge=[[-4.5,2.6],[-4.5,-2.6],[4.5,-2.6],[4.5,2.6]];
      for(let i=0;i<3;i++)line(paint,Array.from({length:101},(_,j)=>mountainProject(G.terrainPoint(G.mix(edge[i],edge[i+1],j/100)))),C.teal,1,.23);
    }
    ctx.drawImage(mountainBackdrop,0,0);
  }
  function traveller(ctx,p,t,moving,opacity=1) {
    // The same walker follows either the 3D chord or the lifted Monge geodesic.
    const stride=moving?Math.sin(t*9)*3:2;
    ctx.save();ctx.translate(...p);
    line(ctx,[[-stride,0],[0,-10],[stride,0]],C.paper,6,opacity);
    line(ctx,[[-stride,0],[0,-10],[stride,0]],C.ink,2.7,opacity);
    line(ctx,[[0,-10],[0,-21]],C.paper,7,opacity);
    line(ctx,[[0,-10],[0,-21]],C.ink,3.3,opacity);
    line(ctx,[[0,-19],[6,-13],[9,-17]],C.ink,2.5,opacity);
    line(ctx,[[10,-17],[12,0]],C.muted,1.7,opacity);
    dot(ctx,[-4,-17],4.6,C.orange,opacity);
    dot(ctx,[0,-27],5.4,C.paper,opacity);dot(ctx,[0,-27],3.8,C.ink,opacity);
    ctx.restore();
  }

  const scenes = {
    title(ctx,t) {
      const b=chart(36,0,566,280,-2.6,4,-2.7,2.7);
      bananaPlot(ctx,b);
      const progress=frac(t,.2,4);
      gaussian.slice(0,170).forEach((z,i)=>{
        const p=G.banana(z.map(a=>a*progress)); dot(ctx,b.map(p),2.3,C.teal,.26+(i%5)*.03);
      });
      const tr=triangle(326,452,327); drawTriangle(ctx,tr,{labels:false});
      categoryPoints.slice(0,150).forEach(({p,k})=>dot(ctx,tr.map(G.mix([1/3,1/3,1/3],p,progress)),2.4,colors[k],.48));
    },
    mountains(ctx,t,stage) {
      drawMountainTerrain(ctx);
      const start=mountainProject(mountainRoute.at(0)),end=mountainProject(mountainRoute.at(1));
      const tunnelProgress=stage>=2?1:G.clamp((t-.4)/6);
      if(stage>=1) {
        // Opacity follows actual burial depth, not a hand-picked screen region.
        const stroke=ctx.createLinearGradient(...start,...end),halo=ctx.createLinearGradient(...start,...end);
        for(let i=0;i<=160;i++) {
          const u=i/160,opacity=G.undergroundOpacity(mountainRoute.straightAt(u));
          stroke.addColorStop(u,`rgba(207,112,76,${opacity})`);
          halo.addColorStop(u,`rgba(250,249,246,${opacity*.8})`);
        }
        const points=[start,G.mix(start,end,tunnelProgress)];
        line(ctx,points,halo,7);line(ctx,points,stroke,3.5);
        text(ctx,'Straight line',80,31,26,C.orange);
      }
      const progress=stage>=2?G.clamp((t-.4)/8):0;
      if(stage>=2) {
        const route=u=>mountainProject(mountainRoute.at(u));
        arcPath(ctx,route,progress,C.paper,11,.95);
        arcPath(ctx,route,progress,C.teal,5.5);
        text(ctx,`Monge geodesic  ·  α = ${mountainAlpha}`,1200,31,26,C.teal,'right');
      }
      dot(ctx,start,5,C.teal);ring(ctx,start,10,C.teal,.3,2);
      dot(ctx,end,5,C.teal);ring(ctx,end,10,C.teal,.3,2);
      text(ctx,'Start',start[0]-10,start[1]+37,23,C.ink,'center');
      text(ctx,'Destination',end[0]+8,end[1]+37,23,C.ink,'center');
      const point=stage===1?mountainRoute.straightAt(tunnelProgress):mountainRoute.at(progress);
      const moving=stage===1?tunnelProgress>0&&tunnelProgress<1:stage>=2&&progress>0&&progress<1;
      traveller(ctx,mountainProject(point),t,moving,stage===1?G.undergroundOpacity(point):1);
    },
    target(ctx,t,stage) {
      const ch=chart(342,17,750,422,-2.6,4,-2.8,2.8);
      bananaPlot(ctx,ch);
      if(stage>=1) {
        const n=Math.floor(gaussian.length*frac(t,0,5));
        gaussian.slice(0,n).forEach(z=>dot(ctx,ch.map(G.banana(z)),3.3,C.teal,.6));
        text(ctx,'Samples',34,255,29,C.teal);
        text(ctx,'represent uncertainty',34,291,23,C.muted);
      } else {
        dot(ctx,ch.map(G.banana([0,0])),8,C.orange);
        text(ctx,'One estimate',34,255,29,C.orange);
      }
      text(ctx,'Target distribution',1120,27,22,C.muted,'right');
    },
    geodesics(ctx,t,stage) {
      const left=chart(8,70,566,346,-2.6,3.6,-2.5,2.5),right=chart(701,70,566,346,-2.6,3.6,-2.5,2.5);
      text(ctx,'Straight paths',left.x,22,27,C.orange);text(ctx,'Geodesic paths',right.x,22,27,C.teal);
      bananaPlot(ctx,left,true);bananaPlot(ctx,right,true,stage?1:.35);
      const s=frac(t,.25,4.5);
      const seeds=[[2.1,.3],[-2,.4],[1.4,-.8],[-1.4,-.7],[.9,1.3],[-.75,1.2]];
      seeds.forEach(z=>{
        const eu=u=>left.map([-1.3+.48*z[1]*u,z[0]*u]);
        const geo=u=>right.map(G.banana(z.map(a=>a*u)));
        arcPath(ctx,eu,stage?1:s,C.orange,2.6,.8);dot(ctx,eu(stage?1:s),6,C.orange);
        if(stage){arcPath(ctx,geo,s,C.teal,2.6,.85);dot(ctx,geo(s),6,C.teal);}
      });
      dot(ctx,left.map([-1.3,0]),7,C.ink);dot(ctx,right.map([-1.3,0]),7,C.ink);
      text(ctx,'Same starting point and initial velocities',640,460,21,C.muted,'center');
    },
    modes(ctx,t,stage) {
      if(stage)return;
      const ch=chart(110,65,1060,330,-3.5,3.5,-1.2,1.2);
      for(const x of [-2.1,2.1])for(const r of [.4,.75,1.1]) {
        const pts=Array.from({length:101},(_,i)=>ch.map([x+r*Math.cos(i/100*tau),r*.65*Math.sin(i/100*tau)]));
        line(ctx,pts,C.teal,1.8,.36);
      }
      text(ctx,'One possibility',ch.map([-2.1,0])[0],25,26,C.ink,'center');
      text(ctx,'Another possibility',ch.map([2.1,0])[0],25,26,C.ink,'center');
      text(ctx,'Low probability',640,380,23,C.muted,'center');
      // A full traversal at constant Riemannian speed. No easing changes its timing.
      const progress=G.clamp((t-.7)/8),end=inverseTraversal(progress);
      line(ctx,[ch.map([-2.1,0]),ch.map([2.1,0])],C.line,1.7,1,[4,8]);
      line(ctx,[ch.map([-2.1,0]),ch.map([end.x,0])],C.teal,3);
      dot(ctx,ch.map([end.x,0]),9,C.teal);ring(ctx,ch.map([end.x,0]),17,C.teal,.15,7);
      for(let i=0;i<=24;i++){const p=i/24;if(p<=progress)dot(ctx,ch.map([inverseTraversal(p).x,0]),2.8,C.teal,.5);}
      text(ctx,'Equal time intervals',640,438,21,C.muted,'center');
    },
    simplex(ctx,t,stage) {
      const tr=triangle(879,251,431);drawTriangle(ctx,tr,{gridLines:stage>=1});
      let p=[1/3,1/3,1/3];
      if(stage===1)p=G.mix(p,[.6,.3,.1],frac(t,0,3));
      if(stage>=2) {
        const q=G.clamp(t/7),anchors=[[.6,.3,.1],[.12,.73,.15],[.1,.15,.75],[.6,.3,.1]];
        const seg=Math.min(2,Math.floor(q*3));p=G.mix(anchors[seg],anchors[seg+1],ease(q*3-seg));
      }
      text(ctx,'An unclear character',25,41,24,C.muted);
      // A deliberately ambiguous character sketch, not a classifier input image.
      ctx.save();ctx.translate(87,105);ctx.rotate(-.06);ctx.font='italic 115px Georgia, serif';ctx.fillStyle=C.ink;ctx.globalAlpha=.55;ctx.fillText('A',0,90);ctx.restore();
      if(stage>=1) {
        letters.forEach((letter,k)=>{
          const y=261+k*66;text(ctx,letter,28,y,29,colors[k], 'left',500);
          line(ctx,[[72,y],[332,y]],C.line,8,.45);
          line(ctx,[[72,y],[72+260*p[k],y]],colors[k],8);
          text(ctx,`${Math.round(p[k]*100)}%`,414,y,28,colors[k],'right');
        });
        const point=tr.map(p);dot(ctx,point,9,C.ink);ring(ctx,point,16,C.paper,1,3);
      } else {text(ctx,'A     B     C',28,302,32,C.ink);}
    },
    ilr(ctx,t,stage) {
      const tr=triangle(288,244,424),ch=chart(782,39,417,386,-3.3,3.3,-3.3,3.3);
      drawTriangle(ctx,tr);grid(ctx,ch,3);
      text(ctx,'Probability simplex',288,461,24,C.ink,'center');text(ctx,'ILR coordinates',991,461,24,C.ink,'center');
      text(ctx,'ILR',642,209,23,C.muted,'center');
      line(ctx,[[589,243],[694,243]],C.muted,1.5);line(ctx,[[588,243],[600,237]],C.muted);line(ctx,[[588,243],[600,249]],C.muted);line(ctx,[[694,243],[682,237]],C.muted);line(ctx,[[694,243],[682,249]],C.muted);
      if(stage>=2) {
        const a=frac(t,0,3);
        [.7,1.35,2,2.7].forEach(r=>{
          const points=Array.from({length:181},(_,i)=>[r*Math.cos(i/180*tau),r*Math.sin(i/180*tau)]);
          line(ctx,points.map(z=>ch.map(z)),C.teal,1.5,.5*a);
          line(ctx,points.map(z=>tr.map(G.inverseIlr(z))),C.teal,1.5,.5*a);
        });
      }
      const a=G.ilr([.12,.7,.18]),b=G.ilr([.72,.09,.19]);
      const progress=stage>=1?(stage>=2?1:frac(t,0,6)):0;
      if(stage>=1) {
        const path=u=>G.mix(a,b,u);
        arcPath(ctx,u=>ch.map(path(u)),progress,C.orange,3);
        arcPath(ctx,u=>tr.map(G.inverseIlr(path(u))),progress,C.orange,3);
      }
      const z=G.mix(a,b,progress);dot(ctx,ch.map(z),8,C.orange);dot(ctx,tr.map(G.inverseIlr(z)),8,C.orange);
    },
    interpolation(ctx,t,stage) {
      const tr=triangle(502,235,433);drawTriangle(ctx,tr);
      const s=stage>=1?(stage>=2?1:frac(t,0,5)):0;
      if(stage>=1)for(let k=0;k<3;k++) {
        const vertices=tr.v.map((_,j)=>G.interpolateCategory(k,[j===0?1:0,j===1?1:0,j===2?1:0]));
        polygon(ctx,vertices.map(p=>tr.map(p)),colors[k],.075*s);
      }
      categoryPoints.forEach(({p,k})=>{
        const vertex=[0,0,0];vertex[k]=1;dot(ctx,tr.map(G.mix(vertex,p,s)),stage?3:5,colors[k],stage?.43:1);
      });
      text(ctx,stage?'Continuous representations':'Observed categories',980,80,26,C.ink,'center');
      if(stage===0)letters.forEach((l,k)=>text(ctx,l,854+k*124,241,60,colors[k],'center'));
      if(stage>=1) {
        text(ctx,'The original category',978,218,24,C.muted,'center');
        text(ctx,'remains largest',978,254,24,C.muted,'center');
      }
      if(stage>=2) {
        const q=frac(t,0,3.5);
        [categoryPoints[12],categoryPoints[13],categoryPoints[14]].forEach(({p,k})=>{
          const point=tr.map(p),end=[854+k*124,355];
          ring(ctx,point,9,colors[k],1,2);
          const curve=u=>[point[0]+u*(end[0]-point[0]),point[1]+u*(end[1]-point[1])-Math.sin(Math.PI*u)*24];
          arcPath(ctx,curve,q,colors[k],1.4,.35);dot(ctx,curve(q),5,colors[k],1-q*.5);
          if(q>.85)text(ctx,letters[k],...end,43,colors[k],'center');
        });
      }
    },
    flow(ctx,t,stage) {
      if(stage>=2)return;
      const ch=chart(49,73,405,332,-2.5,2.5,-2.3,2.3),tr=triangle(920,241,409);
      text(ctx,'Continuous coordinates',250,20,27,C.ink,'center');text(ctx,'Probability simplex',920,20,27,C.ink,'center');
      grid(ctx,ch,2);drawTriangle(ctx,tr);
      const s=stage>=1?frac(t,0,7):0;
      flowPaths.forEach(({path,k},i)=>{
        const a=s*(path.length-1),j=Math.min(path.length-2,Math.floor(a));
        const latent=G.mix(path[j],path[j+1],a-j),p=G.inverseIlr(latent);
        dot(ctx,ch.map(latent),2.8,stage?colors[k]:C.muted,.65);
        dot(ctx,tr.map(p),2.8,stage?colors[k]:C.muted,.65);
        if(stage&&i<9)line(ctx,path.slice(0,j+1).map(z=>ch.map(z)),colors[k],1.3,.38);
      });
      text(ctx,'Map back',625,220,22,C.muted,'center');
      line(ctx,[[523,252],[729,252]],C.muted,1.4);line(ctx,[[729,252],[715,245]],C.muted);line(ctx,[[729,252],[715,259]],C.muted);
      text(ctx,'Analytic flow illustration',250,460,21,C.muted,'center');
      if(stage&&s>.92) letters.forEach((l,k)=>text(ctx,l,828+k*92,459,31,colors[k],'center'));
    },
    multiclass(ctx,t,stage) {
      const transition=stage?frac(t,0,.7):0;
      const glyph=(letter,x,y,size,angle=0,alpha=1,color=C.ink)=>{
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
        ctx.font=`italic ${size}px Georgia, serif`;ctx.fillStyle=color;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(letter,0,0);ctx.restore();
      };
      // Training examples and labels are explicit, separate from the unseen input.
      if(transition<1) {
        ctx.save();ctx.globalAlpha=1-transition;
        text(ctx,'Labelled examples',230,42,27,C.ink,'center');
        text(ctx,'Character',158,91,21,C.muted,'center');text(ctx,'Label',356,91,21,C.muted,'center');
        letters.forEach((letter,k)=>{
          const y=156+k*99;
          [-1,0,1].forEach((offset,j)=>glyph(letter,158+offset*69,y,45+j*5,offset*.12,1-transition));
          text(ctx,letter,356,y,30,colors[k],'center',500);
          line(ctx,[[405,y],[581,230]],C.line,1.6);
          if(!stage){const s=frac(t,k*.35,3.5);dot(ctx,G.mix([405,y],[581,230],s),5,colors[k],.85);}
        });
        ctx.restore();
      }
      ring(ctx,[690,230],88,C.ink,1,1.7);
      text(ctx,'Classifier',690,230,28,C.ink,'center',500);
      text(ctx,'Possible classes',1090,63,26,C.ink,'center');
      letters.forEach((letter,k)=>{
        const y=132+k*98;
        line(ctx,[[797,230],[1026,y]],C.line,1.6);
        text(ctx,letter,1090,y,40,stage&&k===1&&t>3.2?C.orange:C.muted,'center',500);
      });
      if(stage) {
        ctx.save();ctx.globalAlpha=transition;
        text(ctx,'New input',230,65,27,C.ink,'center');
        glyph('B',230,230,100,-.1,transition);
        line(ctx,[[319,230],[579,230]],C.line,1.6);
        const into=frac(t,.8,2.2),out=frac(t,3,1.8);
        line(ctx,[[319,230],[319+260*into,230]],C.orange,2.6);
        if(into>0&&into<1)dot(ctx,[319+260*into,230],6,C.orange);
        if(out>0){line(ctx,[[797,230],[797+229*out,230]],C.orange,2.6);dot(ctx,[797+229*out,230],5,C.orange);}
        if(out>.9){ring(ctx,[1090,230],43,C.orange,1,2.5);text(ctx,'Predicted class',1090,416,24,C.orange,'center');}
        ctx.restore();
      }
    },
    classification(ctx,t,stage) {
      if(stage===1) {
        text(ctx,'80% confidence',640,55,41,C.ink,'center',500);
        const n=Math.floor(frac(t,.2,4)*10);
        for(let i=0;i<10;i++) {
          const x=100+i*120,y=212;ring(ctx,[x,y],32,C.line,1,1.6);
          if(i<n) {
            dot(ctx,[x,y],32,i<8?C.teal:C.orange,.12);
            if(i<8)line(ctx,[[x-12,y],[x-3,y+9],[x+15,y-12]],C.teal,3);
            else {line(ctx,[[x-10,y-10],[x+10,y+10]],C.orange,3);line(ctx,[[x-10,y+10],[x+10,y-10]],C.orange,3);}
          }
        }
        text(ctx,'About 8 in 10 correct',640,346,32,C.teal,'center');
        text(ctx,'Calibration illustration',640,412,21,C.muted,'center');return;
      }
      const ch=chart(67,71,393,328,-2.2,2.2,-2.2,2.2),tr=triangle(942,239,408);
      text(ctx,'Latent Gaussian prediction',260,20,26,C.ink,'center');text(ctx,'Predicted probabilities',942,20,26,C.ink,'center');
      grid(ctx,ch,2);drawTriangle(ctx,tr);
      const center=G.ilr([.6,.28,.12]),progress=frac(t,0,5);
      const points=gaussian.slice(0,230),count=Math.floor(points.length*progress);
      const probabilities=[];
      points.slice(0,count).forEach(([u,v])=>{
        const z=[center[0]+.32*u,center[1]+.23*v+.08*u];const p=G.inverseIlr(z);probabilities.push(p);
        dot(ctx,ch.map(z),3,C.teal,.3);dot(ctx,tr.map(p),3,C.teal,.3);
      });
      if(count){const mean=probabilities.reduce((sum,p)=>sum.map((x,i)=>x+p[i]/count),[0,0,0]);dot(ctx,tr.map(mean),7,C.orange);}
      text(ctx,'Map and average',638,211,22,C.muted,'center');line(ctx,[[527,247],[747,247]],C.muted,1.4);line(ctx,[[747,247],[733,240]],C.muted);line(ctx,[[747,247],[733,254]],C.muted);
      text(ctx,'Monte Carlo prediction',941,459,21,C.muted,'center');
    },
    closing(ctx,t) {
      const ch=chart(26,74,541,316,-2.6,3.6,-2.5,2.5),tr=triangle(988,231,338);
      bananaPlot(ctx,ch);
      const s=frac(t,0,4);
      gaussian.slice(0,170).forEach(z=>dot(ctx,ch.map(G.banana(z.map(a=>a*s))),2.4,C.teal,.45));
      drawTriangle(ctx,tr,{labels:false});
      categoryPoints.slice(0,150).forEach(({p,k})=>dot(ctx,tr.map(G.mix([1/3,1/3,1/3],p,s)),2.5,colors[k],.47));
      text(ctx,'Target distributions',298,22,27,C.ink,'center');text(ctx,'The probability simplex',988,22,27,C.ink,'center');
      text(ctx,'Choose the paths',298,450,24,C.teal,'center');text(ctx,'Choose the coordinates',988,450,24,C.teal,'center');
    },
  };

  function stageOf(section) { return [...section.querySelectorAll('.scene-step')].filter(el=>el.classList.contains('visible')).length; }
  function updateStage(section,forced) {
    const stage=forced ?? stageOf(section);section.dataset.stage=stage;
    const caption=section.querySelector('.stage-caption');
    if(caption) {
      const name=section.dataset.scene;
      if(name==='mountains')caption.textContent=['How do we reach the other side?','The straight line goes underground.','Geometry guides exploration.'][Math.min(stage,2)];
      if(name==='modes')caption.textContent=stage?'More configurations explored in the tested field system':'Faster motion through low-density regions';
      if(name==='flow')caption.textContent=stage>=2?'Samples outside the target pattern · lower is better':'Learn in continuous coordinates. Generate categories.';
      if(name==='classification')caption.textContent=stage===1?'Confidence should agree with how often predictions are correct':'Exact latent inference in the constructed Gaussian model';
    }
    return stage;
  }
  function render(section,time,forcedStage) {
    const canvas=section?.querySelector('canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const stage=updateStage(section,forcedStage);
    scenes[section.dataset.scene]?.(ctx,time,stage);
  }
  function tick(now) {
    request=0;
    if(!active||paused||reduced||printMode||document.hidden||Reveal.isOverview()||Reveal.isPaused()) {previousTime=0;return;}
    if(previousTime)elapsed+=(now-previousTime)/1000;previousTime=now;
    render(active,elapsed);
    if(elapsed<12)request=requestAnimationFrame(tick);
  }
  function restart() {
    cancelAnimationFrame(request);request=0;previousTime=0;elapsed=0;
    if(active){render(active,(reduced||printMode)?12:0);if(!paused&&!reduced&&!printMode)request=requestAnimationFrame(tick);}
  }
  function resume() { previousTime=0;if(!request&&!paused&&!reduced&&!printMode&&elapsed<12)request=requestAnimationFrame(tick); }
  function setSlide(event) {active=event.currentSlide;restart();}
  function toggleMotion() {
    if(reduced){reduced=false;paused=false;restart();}
    else {paused=!paused;if(!paused)resume();else{cancelAnimationFrame(request);request=0;}}
    const button=document.getElementById('motion');button.textContent=paused?'Resume motion':'Pause motion';button.setAttribute('aria-pressed',String(paused));
  }
  function help() {const dialog=document.getElementById('help-dialog');if(dialog.open)dialog.close();else dialog.showModal();}
  function printAll() {sections.forEach(section=>render(section,12,section.querySelectorAll('.scene-step').length));}
  document.getElementById('replay').addEventListener('click',restart);
  document.getElementById('motion').addEventListener('click',toggleMotion);
  document.getElementById('help').addEventListener('click',help);
  document.getElementById('close-help').addEventListener('click',()=>document.getElementById('help-dialog').close());
  window.addEventListener('beforeprint',printAll);
  window.addEventListener('afterprint',()=>{if(active){render(active,elapsed);resume();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(request);request=0;previousTime=0;}else resume();});
  media.addEventListener('change',event=>{reduced=event.matches||stillMode;restart();});
  Reveal.initialize({
    width:1440,height:810,margin:.025,minScale:.15,maxScale:2,
    hash:true,hashOneBasedIndex:false,controls:true,controlsLayout:'edges',
    controlsBackArrows:'visible',progress:true,center:false,slideNumber:'c/t',
    transition:reduced?'none':'fade',transitionSpeed:'fast',backgroundTransition:'none',
    autoSlide:0,loop:false,disableLayout:false,pdfSeparateFragments:false,pdfMaxPagesPerSlide:1,
    keyboard:{
      49:()=>Reveal.slide(0,0,-1),
      48:()=>Reveal.slide(sections.length-1,0,-1),
      82:restart,77:toggleMotion,72:help,
    },
  }).then(()=>{
    // Reveal creates this empty placeholder even without its notes plugin.
    Reveal.getRevealElement().querySelector('.speaker-notes')?.remove();
    active=Reveal.getCurrentSlide();
    // Render every scene once, including slides that have not yet been visited.
    // This makes overview and PDF mode legible without running hidden animations.
    sections.forEach(section=>render(section,12,printMode?section.querySelectorAll('.scene-step').length:0));
    if(printMode)printAll();else restart();
    document.documentElement.dataset.lectioReady='true';
  });
  Reveal.on('slidechanged',setSlide);
  Reveal.on('fragmentshown',restart);Reveal.on('fragmenthidden',restart);
  Reveal.on('overviewshown',()=>{cancelAnimationFrame(request);request=0;sections.forEach(section=>render(section,12));});
  Reveal.on('overviewhidden',()=>{active=Reveal.getCurrentSlide();restart();});
  Reveal.on('paused',()=>{cancelAnimationFrame(request);request=0;});Reveal.on('resumed',resume);
})();
