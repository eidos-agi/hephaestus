import { DatabaseSync } from 'node:sqlite';
import { UsageGuard } from '../src/usage.ts';

export function usageFixture(env={}) {
  const sqlite=new DatabaseSync(':memory:');
  const storage={
    sql:{exec(query,...params){const stmt=sqlite.prepare(query);if(stmt.columns().length)return stmt.all(...params);stmt.run(...params);return [];}},
    transactionSync(fn){sqlite.exec('BEGIN');try{const result=fn();sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}},
  };
  let guard=new UsageGuard({storage},env),calls=0;
  const binding={
    idFromName(name){return name;},
    get(){return {fetch(url,options){calls++;return guard.fetch(new Request(url,options));}};},
  };
  return {binding,sqlite,get calls(){return calls;},restart(){guard=new UsageGuard({storage},env);}};
}
