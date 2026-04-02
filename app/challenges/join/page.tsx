"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Clock, Crown, Sparkles, Trophy, Users } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/hooks"

export default function JoinChallengePage() {
  const { toast } = useToast()
  const [postDishOpen, setPostDishOpen] = useState(false)
  const [postDishTitle, setPostDishTitle] = useState("")
  const [postDishCaption, setPostDishCaption] = useState("")

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Weekly Challenge</p>
            <h1 className="text-2xl md:text-3xl font-serif font-light text-foreground">
              Pantry Rescue
            </h1>
          </div>
          <Badge className="bg-primary/15 text-primary border border-primary/20">
            +100 pts
          </Badge>
        </div>

        <Card className="overflow-hidden">
          <div className="relative w-full aspect-[16/9] bg-muted">
            <Image
              src="/placeholder.svg?height=900&width=1600"
              alt="Challenge cover placeholder"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute left-4 bottom-4 right-4 flex flex-wrap items-center gap-2 text-white">
              <Badge className="bg-black/40 text-white border-white/20">
                <Clock className="h-3.5 w-3.5 mr-1" />
                2d left
              </Badge>
              <Badge className="bg-black/40 text-white border-white/20">
                <Users className="h-3.5 w-3.5 mr-1" />
                184 joined
              </Badge>
              <Badge className="bg-black/40 text-white border-white/20">
                <Trophy className="h-3.5 w-3.5 mr-1" />
                #8 among friends
              </Badge>
            </div>
          </div>

          <CardContent className="p-4 md:p-6 space-y-5">
            <div className="space-y-2">
              <h2 className="text-lg md:text-xl font-semibold text-foreground">
                Overview
              </h2>
              <p className="text-sm text-muted-foreground">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                posuere, nulla at dignissim tincidunt, leo nunc hendrerit
                sapien, sed consequat ipsum risus vitae lorem. Integer vitae
                nisl a turpis luctus gravida.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    How it works
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis
                  non lorem vel mi facilisis.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    Prizes
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Lorem ipsum dolor sit amet. Winner featured Sunday. Integer
                  nec arcu quis.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" />
                    Tips
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Lorem ipsum dolor sit amet, consectetur. Proin ut leo sed
                  neque porta.
                </CardContent>
              </Card>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">
                Example entries
              </h3>
              <div className="grid gap-3 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="relative w-full aspect-[4/3] bg-muted">
                      <Image
                        src={`/placeholder.svg?height=600&width=800&text=Entry+${i}`}
                        alt={`Entry ${i} placeholder`}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium text-foreground">
                        Lorem ipsum entry {i}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                        Aenean commodo ligula eget dolor.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <Button className="flex-1">Join Challenge</Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPostDishOpen(true)}
              >
                Post Your Dish
              </Button>
              <Button variant="ghost" className="flex-1" asChild>
                <Link href="/home">Back to Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={postDishOpen} onOpenChange={setPostDishOpen}>
        <DialogContent className="w-[96vw] max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b text-left">
            <DialogTitle className="text-base">Post your dish</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted overflow-hidden">
                <Image
                  src="/placeholder.svg?height=600&width=800&text=Upload+Photo"
                  alt="Upload placeholder"
                  fill
                  className="object-cover opacity-80"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button variant="secondary" size="sm">
                    Choose image (placeholder)
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-title">Dish name</Label>
              <Input
                id="post-title"
                value={postDishTitle}
                onChange={(e) => setPostDishTitle(e.target.value)}
                placeholder="Lorem ipsum"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-caption">Caption</Label>
              <Textarea
                id="post-caption"
                value={postDishCaption}
                onChange={(e) => setPostDishCaption(e.target.value)}
                placeholder="Lorem ipsum dolor sit amet, consectetur adipiscing elit..."
              />
            </div>

            <div className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Challenge</span>
                <Badge variant="secondary">Pantry Rescue</Badge>
              </div>
            </div>
          </div>

          <div className="border-t bg-background/95 px-4 py-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPostDishTitle("")
                  setPostDishCaption("")
                }}
              >
                Clear
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  setPostDishOpen(false)
                  toast({
                    title: "Posted (placeholder)",
                    description: "Lorem ipsum dolor sit amet.",
                  })
                }}
              >
                Post
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

