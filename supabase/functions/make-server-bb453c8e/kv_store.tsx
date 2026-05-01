// KV store for make-server-bb453c8e
// Uses the same underlying table as make-server-0b7d3bae so that
// ice_ keys and bonus_cards_email_* keys live in the same DB table.

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const TABLE = "kv_store_0b7d3bae";

const client = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

export const set = async (key: string, value: any): Promise<void> => {
  const { error } = await client().from(TABLE).upsert({ key, value });
  if (error) throw new Error(error.message);
};

export const get = async (key: string): Promise<any> => {
  const { data, error } = await client()
    .from(TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
};

export const del = async (key: string): Promise<void> => {
  const { error } = await client().from(TABLE).delete().eq("key", key);
  if (error) throw new Error(error.message);
};

export const getByPrefixWithKeys = async (
  prefix: string,
): Promise<{ key: string; value: any }[]> => {
  const pageSize = 999;
  const all: { key: string; value: any }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client()
      .from(TABLE)
      .select("key, value")
      .like("key", prefix + "%")
      .order("key", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
};
