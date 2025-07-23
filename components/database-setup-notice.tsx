"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Database, ExternalLink } from "lucide-react"

export function DatabaseSetupNotice() {
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <Database className="h-5 w-5" />
          Database Setup Required
        </CardTitle>
        <CardDescription className="text-orange-700">
          To see real recipes and use all features, you need to set up your Supabase database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-orange-700">
          <p className="mb-2">Follow these steps:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open your Supabase project dashboard</li>
            <li>Go to the SQL Editor</li>
            <li>Run the setup-database-v2.sql script</li>
            <li>Run the sample-recipes.sql script</li>
            <li>Refresh this page</li>
          </ol>
        </div>
        <Button
          variant="outline"
          className="border-orange-300 text-orange-800 hover:bg-orange-100 bg-transparent"
          onClick={() => window.open("https://supabase.com/dashboard", "_blank")}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open Supabase Dashboard
        </Button>
      </CardContent>
    </Card>
  )
}
