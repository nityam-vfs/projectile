export type TimelineImageTask = {
  id: string; name: string; type: "task" | "summary" | "milestone";
  parentId: string | null; start?: string; finish?: string; critical?: boolean;
};
export type TimelineImageLink = {
  predecessorId: string; successorId: string; type: string; lag: number;
};

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]!));
const day = 86400000;

export function buildTimelineSvg(projectName: string, tasks: TimelineImageTask[], links: TimelineImageLink[], first: number, days: number, scale: number) {
  const rows = [...tasks];
  const width = 220 + days * scale, height = 46 + rows.length * 39;
  const index = new Map(rows.map((task,i)=>[task.id,i]));
  const depth = (task: TimelineImageTask) => { let n=0, parent=task.parentId; while(parent) { n++; parent=rows.find(t=>t.id===parent)?.parentId??null; } return n; };
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="25" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#24352e">${esc(projectName)} — Project timeline</text><rect x="0" y="46" width="220" height="${height-46}" fill="#fff"/><text x="10" y="73" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#89958f">TASK</text>`];
  for(let i=0;i<days;i++) { const date=new Date(first+i*day); const x=220+i*scale; const weekend=date.getUTCDay()===0||date.getUTCDay()===6; if(weekend)parts.push(`<rect x="${x}" y="46" width="${scale}" height="${height-46}" fill="#f5f6f5"/>`); parts.push(`<text x="${x+scale/2}" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="${weekend?"#b4bdb8":"#77847d"}">${date.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"})}</text><path d="M${x} 46V${height}" stroke="#edf0ed"/>`); }
  parts.push(`<path d="M0 46H${width}" stroke="#dce5df"/>`);
  rows.forEach((t,i)=>{const y=46+i*39;parts.push(`<path d="M0 ${y+39}H${width}" stroke="#f0f2f0"/><text x="${10+depth(t)*15}" y="${y+24}" font-family="Arial,sans-serif" font-size="11" font-weight="${t.type==="summary"?700:400}" fill="#24352e">${esc(t.name)}</text>`);});
  links.forEach(link=>{const from=index.get(link.predecessorId),to=index.get(link.successorId),a=rows[from??-1],b=rows[to??-1];if(from===undefined||to===undefined||!a?.start||!b?.start)return;const x1=220+(Date.parse(`${a.finish??a.start}T00:00:00Z`)-first)/day*scale+scale/2,y1=46+from*39+19,x2=220+(Date.parse(`${b.start}T00:00:00Z`)-first)/day*scale+scale/2,y2=46+to*39+19,mx=(x1+x2)/2,my=(y1+y2)/2-5,label=`${link.type}${link.lag?`${link.lag>0?"+":""}${link.lag}d`:""}`;parts.push(`<path d="M${x1},${y1} C${x1+18},${y1} ${x2-18},${y2} ${x2},${y2}" fill="none" stroke="${a.critical&&b.critical?"#d66b63":"#9eafa5"}" stroke-width="1.5" marker-end="url(#arrow)"/><text x="${mx}" y="${my}" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#66736c" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(label)}</text>`);});
  rows.forEach((t,i)=>{if(!t.start)return;const x=220+(Date.parse(`${t.start}T00:00:00Z`)-first)/day*scale;const length=t.finish?Math.max(1,(Date.parse(`${t.finish}T00:00:00Z`)-Date.parse(`${t.start}T00:00:00Z`))/day+1):1;const y=46+i*39+15;if(t.type==="milestone")parts.push(`<path d="M${x+scale/2} ${y-5}l5 5-5 5-5-5z" fill="#c79532"/>`);else parts.push(`<rect x="${x}" y="${y}" width="${Math.max(1,length*scale)}" height="9" rx="5" fill="${t.critical?"#d66b63":"#80b49a"}/>`);});
  parts.push(`<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3z" fill="#9eafa5"/></marker></defs></svg>`);
  return parts.join("");
}
