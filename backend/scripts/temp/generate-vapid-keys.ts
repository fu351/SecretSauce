#!/usr/bin/env tsx

import webpush from "web-push"

function parseSubject(argv: string[]): string {
  const subjectFlag = argv.find((arg) => arg.startsWith("--subject="))
  if (subjectFlag) {
    const value = subjectFlag.slice("--subject=".length).trim()
    if (value) return value
  }

  const subjectIndex = argv.indexOf("--subject")
  if (subjectIndex >= 0 && typeof argv[subjectIndex + 1] === "string") {
    const value = argv[subjectIndex + 1].trim()
    if (value) return value
  }

  return process.env.VAPID_SUBJECT ?? "mailto:notifications@secretsauce.test"
}

function main() {
  const subject = parseSubject(process.argv.slice(2))
  const keys = webpush.generateVAPIDKeys()

  console.log("# Add these to your environment:")
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
  console.log(`VAPID_SUBJECT=${subject}`)
  console.log("")
  console.log("Keep VAPID_PRIVATE_KEY secret and never commit it.")
}

main()
