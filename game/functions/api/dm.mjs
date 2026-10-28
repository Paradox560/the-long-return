import { GET as getDM, POST as postDM } from '../../server/dm.mjs';
export async function GET(request, context) { return getDM(request, context); }
export async function POST(request, context) { return postDM(request, context); }
