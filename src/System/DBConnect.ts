import knex from "knex";
import { dbConf } from "../Config/MainConfig";

export const db = knex(dbConf);

