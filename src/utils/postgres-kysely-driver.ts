import { Driver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';

import { PostgreSQLDriver } from 'https://deno.land/x/kysely_deno_postgres@v0.4.0/mod.ts';

export interface PostgresConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  application?: string;
}

export const createPgKysely = (
  { host, port, username, password, database, application = 'KyselyDenoPostgres' }: PostgresConnectionOptions,
) =>
  new Kysely({
    dialect: {
      createAdapter() {
        return new PostgresAdapter();
      },
      createDriver() {
        return new PostgreSQLDriver({
          applicationName: application,
          connection: { attempts: 1 },
          database,
          hostname: host,
          host_type: 'tcp',
          user: username,
          password,
          port,
          tls: {
            enabled: false,
          },
        }) as unknown as Driver;
      },
      createIntrospector(db: Kysely<unknown>) {
        return new PostgresIntrospector(db);
      },
      createQueryCompiler() {
        return new PostgresQueryCompiler();
      },
    },
  });
