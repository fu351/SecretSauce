"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProfileCollectionsGrid } from "@/components/social/profile-collections-grid"
import { UserPostGrid } from "@/components/social/user-post-grid"
import { UserRecipeGrid } from "@/components/social/user-recipe-grid"

interface ProfileContentTabsProps {
  username: string
  isOwnProfile: boolean
  canViewContent: boolean
}

export function ProfileContentTabs({
  username,
  isOwnProfile,
  canViewContent,
}: ProfileContentTabsProps) {
  return (
    <section className="space-y-4">
      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted/80 p-1">
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <UserPostGrid username={username} canViewContent={canViewContent} />
        </TabsContent>

        <TabsContent value="recipes">
          <UserRecipeGrid
            username={username}
            isOwnProfile={isOwnProfile}
            canViewContent={canViewContent}
          />
        </TabsContent>

        <TabsContent value="collections">
          <ProfileCollectionsGrid username={username} canViewContent={canViewContent} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
