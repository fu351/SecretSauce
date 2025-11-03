import { Card, CardContent } from "@/components/ui/card"

export function RecipeSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-48 w-full bg-gray-200 animate-pulse" />
      <CardContent className="p-4 space-y-3">
        <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4" />
        <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
        <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
        <div className="flex gap-4 mt-4">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
          <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export function RecipeDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-3/5">
            <div className="h-[500px] bg-gray-200 rounded-2xl animate-pulse" />
          </div>
          <div className="lg:w-2/5">
            <Card className="bg-white/90">
              <CardContent className="p-8 space-y-4">
                <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4" />
                <div className="h-20 bg-gray-200 rounded animate-pulse w-full" />
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
