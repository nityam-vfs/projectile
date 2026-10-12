import { describe, expect, it } from "vitest";
import { parsePredecessors, schedule, wbsCodes, type Dependency, type LinkType } from "./scheduler";

const task = (id:string,duration:number,start?:string) => ({id,name:id,duration,start});
describe("project schedule",()=>{
  it("moves an FS successor to the next weekday",()=>{
    const result=schedule([task("a",5),task("b",2)],[{predecessorId:"a",successorId:"b",type:"FS",lag:0}],"2026-10-12");
    expect(result.map(t=>[t.start,t.finish])).toEqual([["2026-10-12","2026-10-16"],["2026-10-19","2026-10-20"]]);
  });
  it("keeps SS work concurrent and computes float",()=>{
    const result=schedule([task("a",5),task("b",3)],[{predecessorId:"a",successorId:"b",type:"SS",lag:0}],"2026-10-12");
    expect(result[1].start).toBe("2026-10-12"); expect(result[1].totalFloat).toBe(2); expect(result[0].critical).toBe(true);
  });
  it("supports FF and SF relationship constraints",()=>{
    const ff=schedule([task("a",5),task("b",3)],[{predecessorId:"a",successorId:"b",type:"FF",lag:0}],"2026-10-12");
    expect(ff[1].finish).toBe(ff[0].finish);
    const sf=schedule([task("a",4),task("b",1)],[{predecessorId:"a",successorId:"b",type:"SF",lag:0}],"2026-10-12");
    expect(sf[1].finish).toBe(sf[0].start);
  });
  it("applies lead and lag in working days",()=>{
    const result=schedule([task("a",2),task("b",2)],[{predecessorId:"a",successorId:"b",type:"FS",lag:1}],"2026-10-16");
    expect(result[1].start).toBe("2026-10-21");
  });
  it("respects project working days and holidays",()=>{
    const result=schedule([task("a",2),task("b",1)],[{predecessorId:"a",successorId:"b",type:"FS",lag:0}],"2026-10-12",{workingDays:[1,2,3,4,5],holidays:["2026-10-12"]});
    expect(result.map(t=>[t.start,t.finish])).toEqual([["2026-10-13","2026-10-14"],["2026-10-15","2026-10-15"]]);
  });
  it("rejects circular dependencies",()=>{
    expect(()=>schedule([task("a",1),task("b",1)],[{predecessorId:"a",successorId:"b",type:"FS",lag:0},{predecessorId:"b",successorId:"a",type:"FS",lag:0}],"2026-10-12")).toThrow(/Circular/);
  });
  it("parses visible task IDs into stable links",()=>{
    expect(parsePredecessors("1, 2SS-1d",new Map([["1","uuid-a"],["2","uuid-b"]]))).toEqual([{predecessorId:"uuid-a",successorId:"",type:"FS",lag:0},{predecessorId:"uuid-b",successorId:"",type:"SS",lag:-1}]);
  });
  it("regenerates WBS numbers from stable task IDs",()=>{
    expect([...wbsCodes([{id:"a",sortOrder:0},{id:"b",parentId:"a",sortOrder:0},{id:"c",sortOrder:1}])]).toEqual([["a","1"],["b","1.1"],["c","2"]]);
  });
  it("calculates summary spans and duration weighted progress from leaf tasks",()=>{
    const result=schedule([{...task("s",1),type:"summary"},{...task("a",2),parentId:"s",percentComplete:100},{...task("b",4),parentId:"s",percentComplete:50}],[],"2026-10-12");
    expect(result[0].start).toBe("2026-10-12"); expect(result[0].finish).toBe("2026-10-15"); expect(result[0].duration).toBe(4); expect(result[0].percentComplete).toBe(67);
  });
  it("schedules the integrated transformation acceptance network",()=>{
    const rows=[5,4,10,12,5,6,4,5,0,5].map((duration,i)=>task(String(i+1),duration));
    const links:Dependency[]=[[1,2,"FS"],[2,3,"FS"],[2,4,"FS"],[3,5,"FS"],[4,5,"FS"],[5,6,"FS"],[6,7,"SS"],[6,8,"FS"],[7,9,"FS"],[8,9,"FS"],[9,10,"FS"]].map(([a,b,type])=>({predecessorId:String(a),successorId:String(b),type:type as LinkType,lag:0}));
    const result=schedule(rows,links,"2026-10-12");
    expect(result.find(t=>t.id==="1")?.start).toBe("2026-10-12");
    expect(result.find(t=>t.id==="9")?.type).toBeUndefined();
    expect(result.find(t=>t.id==="10")?.finish).toBe("2026-12-09");
    expect(result.filter(t=>t.critical).map(t=>t.id)).toEqual(["1","2","4","5","6","8","9","10"]);
  });
});
