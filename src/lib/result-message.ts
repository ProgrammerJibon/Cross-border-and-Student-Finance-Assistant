export function resultMessage(result: {code:string;fieldErrors?:Record<string,string>}) {
  return result.fieldErrors ? Object.entries(result.fieldErrors).map(([field,message])=>`${field}: ${message}`).join(" ") : result.code;
}
