import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// 1. Define the shape of the data you expect
interface SignInNotificationProps {
  featureName: string;
}

// 2. Accept the props in the function arguments
export function SignInNotification({ featureName }: SignInNotificationProps) {
    const router = useRouter()

    return (
      <div className={`h-screen flex items-center justify-center bg-background`}>
        <Card className="bg-card">
          <CardContent className="p-6 text-center">
            <h2 className={`text-2xl font-bold mb-4 text-foreground`}>Authentication Required</h2>
            
            {/* 3. Use the prop variable */}
            <p className={`text-muted-foreground mb-6`}>
              You need to be logged in to use the {featureName}.
            </p>

            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => router.push("/auth/signin")}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
}